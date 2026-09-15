import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { AppError } from './security.js';

export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const EXTENSIONS = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

/** Trust the bytes, not the label: a data URL header is caller-supplied. */
function sniff(bytes) {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (bytes.length > 12 && bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

export function decodeImage(value) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(value || '');
  if (!match) throw new AppError(400, 'Ảnh phải là JPEG, PNG hoặc WebP.');
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length) throw new AppError(400, 'Không đọc được nội dung ảnh.');
  if (bytes.length > MAX_IMAGE_BYTES) throw new AppError(413, 'Ảnh vẫn lớn hơn 3 MB sau khi nén. Hãy chọn ảnh khác.');
  const mime = sniff(bytes);
  if (!mime || mime !== match[1]) throw new AppError(400, 'Nội dung ảnh không khớp với định dạng khai báo.');
  return { mime, bytes };
}

export const photoPath = (dir, id, mime) => join(dir, id + (EXTENSIONS[mime] || '.bin'));
export function writePhoto(dir, id, mime, bytes) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(photoPath(dir, id, mime), bytes, { mode: 0o600 });
}
export const readPhoto = (dir, id, mime) => readFileSync(photoPath(dir, id, mime));
export function removePhoto(dir, id, mime) {
  try { rmSync(photoPath(dir, id, mime), { force: true }); }
  catch { /* The row is the record of truth; a stale file is swept by backup review. */ }
}
