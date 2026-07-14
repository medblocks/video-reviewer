import { Attachment } from '../types';

// Longest edge (px) an image is downscaled to before upload. Screenshots and
// phone photos are far larger than any review comment needs, and the raw
// base64 payload is what makes uploads slow / time out in production.
const MAX_EDGE = 1920;
// Encode quality for the lossy re-encode (WebP, or JPEG fallback).
const QUALITY = 0.8;

function randomId(): string {
  return Math.random().toString(36).substring(7);
}

// Read a File straight to a base64 data URL with no processing. Used for
// non-image attachments (PDFs, docs) which must not be re-encoded.
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// Load a File into an HTMLImageElement via an object URL, revoking it once
// the bitmap has decoded (or on failure).
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image'));
    };
    img.src = objectUrl;
  });
}

// Swap a filename's extension to match the re-encoded output format.
function withExtension(name: string, ext: string): string {
  return name.replace(/\.[^./\\]+$/, '') + '.' + ext;
}

// Turn a File into a local Attachment holding a base64 data URL. Images are
// downscaled (longest edge <= MAX_EDGE) and re-encoded (WebP, JPEG fallback)
// so the deferred upload at submit time carries a few hundred KB instead of
// several MB. Non-images pass through untouched. The actual upload to Directus
// still happens later (on comment submit), so removed images never orphan.
export async function compressImage(file: File, name = file.name): Promise<Attachment> {
  if (!file.type.startsWith('image/')) {
    return {
      id: randomId(),
      name,
      type: 'file',
      url: await fileToDataUrl(file),
    };
  }

  try {
    const img = await loadImage(file);

    const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.drawImage(img, 0, 0, width, height);

    // Prefer WebP; some browsers can't encode it and quietly return a PNG, so
    // detect that and fall back to JPEG (both honor the quality argument).
    let dataUrl = canvas.toDataURL('image/webp', QUALITY);
    let ext = 'webp';
    if (!dataUrl.startsWith('data:image/webp')) {
      dataUrl = canvas.toDataURL('image/jpeg', QUALITY);
      ext = 'jpg';
    }

    return {
      id: randomId(),
      name: withExtension(name, ext),
      type: 'image',
      url: dataUrl,
    };
  } catch {
    // Compression failed (unsupported/corrupt image) — fall back to the raw
    // file so the attachment is never silently dropped.
    return {
      id: randomId(),
      name,
      type: 'image',
      url: await fileToDataUrl(file),
    };
  }
}
