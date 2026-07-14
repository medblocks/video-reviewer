import { Router } from 'express';

const router = Router();

function directusConfigured(): boolean {
  return Boolean(
    process.env.DIRECTUS_URL &&
    process.env.DIRECTUS_TOKEN &&
    process.env.DIRECTUS_UPLOAD_FOLDER
  );
}

// Upload an attachment to Directus and return an Attachment-shaped object.
// The browser sends the file as a base64 data URL (only at comment-submit time,
// so images that are pasted-then-removed never reach Directus). The Directus
// static token stays server-side; the browser only ever sees the asset URL.
router.post('/', async (req, res) => {
  try {
    if (!directusConfigured()) {
      return res.status(500).json({
        error: 'Directus is not configured. Set DIRECTUS_URL, DIRECTUS_TOKEN and DIRECTUS_UPLOAD_FOLDER.',
      });
    }

    const { dataUrl, name } = req.body as { dataUrl?: string; name?: string };
    if (!dataUrl) {
      return res.status(400).json({ error: 'No file provided (expected a base64 "dataUrl")' });
    }

    // data:<mimetype>;base64,<data>
    const match = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
    if (!match) {
      return res.status(400).json({ error: 'Invalid data URL (expected base64-encoded data)' });
    }
    const mimetype = match[1];
    const buffer = Buffer.from(match[2], 'base64');
    const filename = name || `upload.${mimetype.split('/')[1] || 'bin'}`;

    const directusUrl = process.env.DIRECTUS_URL!.replace(/\/+$/, '');

    // Directus expects multipart/form-data at POST /files, with non-file fields
    // (like `folder`) appearing BEFORE the file part.
    const form = new FormData();
    form.append('folder', process.env.DIRECTUS_UPLOAD_FOLDER!);
    form.append('file', new Blob([new Uint8Array(buffer)], { type: mimetype }), filename);

    let directusRes: Response;
    try {
      directusRes = await fetch(`${directusUrl}/files`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.DIRECTUS_TOKEN}` },
        body: form,
        signal: AbortSignal.timeout(30000),
      });
    } catch (err: any) {
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
        console.error('❌ Directus upload timed out');
        return res.status(504).json({ error: 'Upload to storage timed out. Please try again.' });
      }
      throw err;
    }

    if (!directusRes.ok) {
      const body = await directusRes.text();
      console.error('❌ Directus upload failed:', directusRes.status, body);
      return res.status(502).json({ error: 'Directus upload failed' });
    }

    const { data } = await directusRes.json() as { data: { id: string } };
    const url = `${directusUrl}/assets/${data.id}`;

    res.status(201).json({
      id: data.id,
      type: mimetype.startsWith('image/') ? 'image' : 'file',
      url,
      name: filename,
    });
  } catch (error: any) {
    console.error('❌ Error uploading attachment:', error);
    res.status(500).json({
      error: 'Failed to upload attachment',
      details: error?.message || String(error),
    });
  }
});

export default router;
