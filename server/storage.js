import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { put, del } from '@vercel/blob';
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

const fileName = (id, mime) => id + (EXTENSIONS[mime] || '.bin');

function diskStore(dir) {
  const pathFor = photo => join(dir, fileName(photo.id, photo.mime));
  return {
    kind: 'disk',
    async write(id, mime, bytes) { mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, fileName(id, mime)), bytes, { mode: 0o600 }); return ''; },
    async read(photo) { return readFileSync(pathFor(photo)); },
    async remove(photo) { try { rmSync(pathFor(photo), { force: true }); } catch { /* the row is the record of truth */ } },
  };
}

/** Vercel's filesystem does not survive an invocation, so photos live in Blob storage.
 * The blob URL is unguessable but public, so `/api/photos/:id` stays an authenticated
 * proxy rather than being handed to the browser — the family gate does not loosen. */
function blobStore(token) {
  return {
    kind: 'blob',
    async write(id, mime, bytes) {
      const { url } = await put(`photos/${fileName(id, mime)}`, bytes, { access: 'public', contentType: mime, token, addRandomSuffix: true });
      return url;
    },
    async read(photo) {
      if (!photo.url) throw new AppError(404, 'Ảnh chưa có địa chỉ lưu trữ.');
      const response = await fetch(photo.url);
      if (!response.ok) throw new AppError(404, 'Không tải được ảnh từ kho lưu trữ.');
      return Buffer.from(await response.arrayBuffer());
    },
    async remove(photo) { if (photo.url) await del(photo.url, { token }).catch(() => {}); },
  };
}

export function createStorage(config) {
  const token = config.blobToken || process.env.BLOB_READ_WRITE_TOKEN || '';
  return token ? blobStore(token) : diskStore(config.uploadDir);
}
