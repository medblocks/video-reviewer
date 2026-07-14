import { Annotation, Attachment, User, VisualSuggestion } from '../types';

// In production: use relative /api (same origin)
// In development: use localhost:3001
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

// User storage key
const USER_STORAGE_KEY = 'frame_note_user';

// ============ User API ============

export async function createUser(name: string): Promise<User> {
  const response = await fetch(`${API_BASE}/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  
  if (!response.ok) {
    throw new Error('Failed to create user');
  }
  
  const user = await response.json();
  
  // Save to localStorage for persistence
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  
  return user;
}

export async function getUser(id: string): Promise<User | null> {
  try {
    const response = await fetch(`${API_BASE}/users/${id}`);
    
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error('Failed to fetch user');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching user:', error);
    return null;
  }
}

export function getStoredUser(): User | null {
  try {
    const stored = localStorage.getItem(USER_STORAGE_KEY);
    if (!stored) return null;
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

export function clearStoredUser(): void {
  localStorage.removeItem(USER_STORAGE_KEY);
}

// ============ Annotations API ============

export async function getAnnotations(videoId: string): Promise<Annotation[]> {
  try {
    const response = await fetch(`${API_BASE}/annotations/video/${videoId}`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch annotations');
    }
    
    const data = await response.json();
    
    // Transform from API format to frontend format
    return data.map((ann: any) => ({
      id: ann.id,
      videoId: ann.video_id,
      parentId: ann.parent_id,
      startTime: ann.start_time,
      endTime: ann.end_time,
      author: ann.author,
      text: ann.text,
      createdAt: new Date(ann.created_at).getTime(),
      type: ann.type,
      drawingData: ann.drawing_data,
      attachments: ann.attachments || [],
      status: ann.status,
    }));
  } catch (error) {
    console.error('Error fetching annotations:', error);
    return [];
  }
}

export async function saveAnnotation(annotation: Omit<Annotation, 'id' | 'createdAt'> & { userId: string }): Promise<Annotation> {
  const requestBody = {
    video_id: annotation.videoId,
    user_id: annotation.userId,
    parent_id: annotation.parentId,
    start_time: annotation.startTime,
    end_time: annotation.endTime,
    text: annotation.text,
    type: annotation.type,
    drawing_data: annotation.drawingData,
    attachments: annotation.attachments,
  };
  
  const response = await fetch(`${API_BASE}/annotations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });
  
  if (!response.ok) {
    throw new Error('Failed to save annotation');
  }
  
  const data = await response.json();
  
  return {
    id: data.id,
    videoId: data.video_id,
    parentId: data.parent_id,
    startTime: data.start_time,
    endTime: data.end_time,
    author: data.author,
    text: data.text,
    createdAt: new Date(data.created_at).getTime(),
    type: data.type,
    drawingData: data.drawing_data,
    attachments: data.attachments || [],
    status: data.status,
  };
}

export async function deleteAnnotation(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/annotations/${id}`, {
    method: 'DELETE',
  });
  
  if (!response.ok) {
    throw new Error('Failed to delete annotation');
  }
}

export async function updateAnnotation(
  id: string,
  updates: { startTime?: number; endTime?: number; text?: string; status?: 'pending' | 'completed' }
): Promise<Annotation> {
  const response = await fetch(`${API_BASE}/annotations/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      start_time: updates.startTime,
      end_time: updates.endTime,
      text: updates.text,
      status: updates.status,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to update annotation');
  }

  const data = await response.json();

  return {
    id: data.id,
    videoId: data.video_id,
    parentId: data.parent_id,
    startTime: data.start_time,
    endTime: data.end_time,
    author: data.author,
    text: data.text,
    createdAt: new Date(data.created_at).getTime(),
    type: data.type,
    drawingData: data.drawing_data,
    attachments: data.attachments || [],
    status: data.status,
  };
}

export async function clearAnnotations(videoId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/annotations/video/${videoId}`, {
    method: 'DELETE',
  });
  
  if (!response.ok) {
    throw new Error('Failed to clear annotations');
  }
}

// ============ Attachment Upload API ============

// Upload one base64 attachment to Directus (via the backend proxy) and get back
// an Attachment whose `url` points at the hosted asset. The base64 is only sent
// at comment-submit time, so pasted-then-removed images never reach Directus.
const UPLOAD_TIMEOUT_MS = 60_000;

export async function uploadAttachment(attachment: Attachment): Promise<Attachment> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataUrl: attachment.url, name: attachment.name }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error('Failed to upload attachment');
    }

    return await response.json();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Upload timed out — the image may be too large or the connection is slow.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// Upload any still-local (base64 `data:`) attachments to Directus, passing
// through any that already hold a hosted URL. Used when a comment is submitted.
export async function uploadPendingAttachments(attachments: Attachment[]): Promise<Attachment[]> {
  return Promise.all(
    attachments.map(att => att.url.startsWith('data:') ? uploadAttachment(att) : Promise.resolve(att))
  );
}

// ============ Export/Import API ============

export interface ExportData {
  exportVersion: string;
  exportedAt: string;
  videoHash: string;
  annotations: Array<{
    timestamp: string;
    startTime: number;
    endTime: number;
    author: { id: string; name: string };
    text: string;
    type: 'comment' | 'drawing';
    drawingData?: any;
    attachments: any[];
    createdAt: string;
  }>;
}

export async function exportAnnotations(videoId: string): Promise<ExportData> {
  const response = await fetch(`${API_BASE}/annotations/export/${videoId}`);
  
  if (!response.ok) {
    throw new Error('Failed to export annotations');
  }
  
  return await response.json();
}

export async function importAnnotations(
  videoHash: string, 
  annotations: ExportData['annotations'], 
  userId: string
): Promise<{ imported: number }> {
  const response = await fetch(`${API_BASE}/annotations/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ videoHash, annotations, userId }),
  });
  
  if (!response.ok) {
    throw new Error('Failed to import annotations');
  }
  
  return await response.json();
}

// Helper to download export as file
export function downloadExportAsFile(data: ExportData, filename?: string): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `video-annotations-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============ Visual Suggestions API ============

export async function getVisualSuggestions(
  fullTranscript: string,
  selectionTranscript: string,
  selectionTimeRange: { start: number; end: number }
): Promise<VisualSuggestion[]> {
  const response = await fetch(`${API_BASE}/suggestions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullTranscript,
      selectionTranscript,
      selectionTimeRange,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to get visual suggestions');
  }

  const data = await response.json();
  return data.suggestions;
}

// ============ Google Drive API ============

// Origin the backend runs on (the OAuth popup posts its result from here).
// API_BASE may be absolute (dev: http://localhost:3000/api) or relative
// (prod: /api, same-origin) — resolve against the current origin either way.
export const API_ORIGIN = new URL(API_BASE, window.location.origin).origin;

// Whether this user has connected their Google Drive.
export async function getDriveStatus(userId: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/drive/status?userId=${encodeURIComponent(userId)}`);
    if (!response.ok) return false;
    const data = await response.json();
    return Boolean(data.connected);
  } catch (error) {
    console.error('Error checking Drive status:', error);
    return false;
  }
}

// URL to open in a popup to start the OAuth consent flow.
export function getDriveAuthUrl(userId: string): string {
  return `${API_BASE}/drive/auth?userId=${encodeURIComponent(userId)}`;
}

// Backend streaming-proxy URL used as the <video> src for a Drive file.
export function getDriveStreamUrl(fileId: string, userId: string): string {
  return `${API_BASE}/drive/stream/${encodeURIComponent(fileId)}?userId=${encodeURIComponent(userId)}`;
}

// Extract a Google Drive file ID from a pasted share link (or a bare ID).
export function extractDriveFileId(url: string): string | null {
  const input = url.trim();
  if (!input) return null;

  // https://drive.google.com/file/d/<ID>/view
  const fileMatch = input.match(/\/file\/d\/([\w-]+)/);
  if (fileMatch) return fileMatch[1];

  // https://drive.google.com/open?id=<ID> or ...?id=<ID>&...
  const idMatch = input.match(/[?&]id=([\w-]+)/);
  if (idMatch) return idMatch[1];

  // Bare file ID (no slashes, looks like a Drive ID)
  if (/^[\w-]{20,}$/.test(input)) return input;

  return null;
}

