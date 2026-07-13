import { Router } from 'express';
import { google, Auth } from 'googleapis';
import pool from '../db/connection.js';
import type { DriveTokenRow } from '../types.js';

type OAuth2Client = Auth.OAuth2Client;
type Credentials = Auth.Credentials;

const router = Router();

const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';

// Sentinel thrown when a user has not connected their Google Drive yet.
const NOT_CONNECTED = 'NOT_CONNECTED';

function googleConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_OAUTH_REDIRECT_URI
  );
}

function makeOAuthClient(): OAuth2Client {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_OAUTH_REDIRECT_URI
  );
}

// Upsert tokens for a user. Preserves the stored refresh_token when a refresh
// response omits it (Google only returns refresh_token on the first consent).
async function saveTokens(userId: string, tokens: Credentials): Promise<void> {
  await pool.query(
    `INSERT INTO drive_tokens (user_id, access_token, refresh_token, expiry_date, scope, token_type, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
     ON CONFLICT (user_id) DO UPDATE SET
       access_token = EXCLUDED.access_token,
       refresh_token = COALESCE(EXCLUDED.refresh_token, drive_tokens.refresh_token),
       expiry_date = EXCLUDED.expiry_date,
       scope = COALESCE(EXCLUDED.scope, drive_tokens.scope),
       token_type = COALESCE(EXCLUDED.token_type, drive_tokens.token_type),
       updated_at = CURRENT_TIMESTAMP`,
    [
      userId,
      tokens.access_token,
      tokens.refresh_token ?? null,
      tokens.expiry_date ?? null,
      tokens.scope ?? null,
      tokens.token_type ?? null,
    ]
  );
}

// Load a user's tokens into an OAuth2 client. The client auto-refreshes the
// access token when expired; we persist any refreshed tokens via the listener.
async function getAuthorizedClient(userId: string): Promise<OAuth2Client> {
  const result = await pool.query<DriveTokenRow>(
    'SELECT * FROM drive_tokens WHERE user_id = $1',
    [userId]
  );

  if (result.rows.length === 0) {
    throw new Error(NOT_CONNECTED);
  }

  const row = result.rows[0];
  const client = makeOAuthClient();
  client.setCredentials({
    access_token: row.access_token,
    refresh_token: row.refresh_token ?? undefined,
    expiry_date: row.expiry_date ? Number(row.expiry_date) : undefined,
    scope: row.scope ?? undefined,
    token_type: row.token_type ?? undefined,
  });

  // Persist refreshed tokens back to the DB.
  client.on('tokens', (tokens) => {
    saveTokens(userId, tokens).catch((err) =>
      console.error('Failed to persist refreshed Drive tokens:', err)
    );
  });

  return client;
}

// GET /api/drive/status?userId= - Whether this user has connected Google Drive
router.get('/status', async (req, res) => {
  try {
    const userId = req.query.userId as string | undefined;
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const result = await pool.query(
      'SELECT 1 FROM drive_tokens WHERE user_id = $1',
      [userId]
    );
    res.json({ connected: result.rows.length > 0 });
  } catch (error) {
    console.error('Error checking Drive status:', error);
    res.status(500).json({ error: 'Failed to check Drive status' });
  }
});

// GET /api/drive/auth?userId= - Redirect the user to Google's consent screen
router.get('/auth', async (req, res) => {
  try {
    if (!googleConfigured()) {
      return res.status(500).json({ error: 'Google Drive integration is not configured' });
    }

    const userId = req.query.userId as string | undefined;
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    // Make sure this is a real app user before kicking off OAuth.
    const userResult = await pool.query('SELECT 1 FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const oauth2Client = makeOAuthClient();
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline', // request a refresh token
      prompt: 'consent', // force a refresh token even on re-consent
      scope: SCOPES,
      state: userId,
    });

    res.redirect(authUrl);
  } catch (error) {
    console.error('Error starting Drive auth:', error);
    res.status(500).json({ error: 'Failed to start Drive authorization' });
  }
});

// Minimal HTML that notifies the opener window and closes the popup.
function popupResultPage(type: 'drive-connected' | 'drive-error', message = ''): string {
  return `<!DOCTYPE html>
<html>
  <body>
    <script>
      (function () {
        try {
          if (window.opener) {
            window.opener.postMessage(
              { type: ${JSON.stringify(type)}, message: ${JSON.stringify(message)} },
              ${JSON.stringify(FRONTEND_ORIGIN)}
            );
          }
        } catch (e) {}
        window.close();
      })();
    </script>
    <p>${type === 'drive-connected' ? 'Google Drive connected. You can close this window.' : 'Google Drive connection failed.'}</p>
  </body>
</html>`;
}

// GET /api/drive/callback?code=&state= - OAuth redirect target
router.get('/callback', async (req, res) => {
  try {
    const code = req.query.code as string | undefined;
    const userId = req.query.state as string | undefined;

    if (!code || !userId) {
      res.set('Content-Type', 'text/html');
      return res.status(400).send(popupResultPage('drive-error', 'Missing code or state'));
    }

    const oauth2Client = makeOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);
    await saveTokens(userId, tokens);

    res.set('Content-Type', 'text/html');
    res.send(popupResultPage('drive-connected'));
  } catch (error) {
    console.error('Error in Drive callback:', error);
    res.set('Content-Type', 'text/html');
    res.status(500).send(popupResultPage('drive-error', 'Token exchange failed'));
  }
});

// GET /api/drive/stream/:fileId?userId= - Proxy/stream a private Drive file
// with HTTP Range support so the native <video> element can seek.
router.get('/stream/:fileId', async (req, res) => {
  const { fileId } = req.params;
  const userId = req.query.userId as string | undefined;

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  let client: OAuth2Client;
  try {
    client = await getAuthorizedClient(userId);
  } catch (error: any) {
    if (error?.message === NOT_CONNECTED) {
      return res.status(401).json({ error: 'drive_not_connected' });
    }
    console.error('Error authorizing Drive client:', error);
    return res.status(500).json({ error: 'Failed to authorize Google Drive' });
  }

  try {
    const drive = google.drive({ version: 'v3', auth: client });
    const range = req.headers.range;

    const driveRes = await drive.files.get(
      { fileId, alt: 'media', supportsAllDrives: true },
      {
        responseType: 'stream',
        headers: range ? { Range: range } : {},
      }
    );

    // Mirror Drive's status (206 for partial content, 200 otherwise) and headers.
    res.status(driveRes.status);
    const passthrough = ['content-range', 'content-length', 'content-type'];
    for (const header of passthrough) {
      const value = driveRes.headers[header];
      if (value) res.setHeader(header, value as string);
    }
    res.setHeader('Accept-Ranges', 'bytes');

    driveRes.data.on('error', (err: Error) => {
      console.error('Drive stream error:', err);
      if (!res.headersSent) res.status(502).end();
      else res.end();
    });

    // Stop pulling from Drive if the client disconnects.
    req.on('close', () => {
      driveRes.data.destroy();
    });

    driveRes.data.pipe(res);
  } catch (error: any) {
    const status = error?.response?.status || error?.code;
    if (status === 404) {
      return res.status(404).json({ error: 'file_not_found' });
    }
    if (status === 403) {
      return res.status(403).json({ error: 'file_access_denied' });
    }
    console.error('Error streaming Drive file:', error?.message || error);
    res.status(500).json({ error: 'Failed to stream Drive file' });
  }
});

export default router;
