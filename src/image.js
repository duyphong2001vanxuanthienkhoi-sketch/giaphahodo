const MAX_EDGE = 1024, TARGET_BYTES = 900 * 1024;

/** Downscaling through a canvas re-encodes the pixels and drops every EXIF tag with them,
 * including the GPS coordinates an old family photo may still be carrying. */
export async function preparePortrait(file) {
  if (file.size > 40 * 1024 * 1024) throw new Error('Ảnh quá lớn. Hãy chọn ảnh dưới 40 MB.');
  let bitmap;
  try { bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { throw new Error('Không mở được ảnh này. Hãy thử lưu lại dưới dạng JPEG rồi tải lên.'); }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  for (const quality of [0.82, 0.7, 0.6, 0.5]) {
    const data = canvas.toDataURL('image/jpeg', quality);
    if (data.length * 0.75 < TARGET_BYTES) return data;
  }
  return canvas.toDataURL('image/jpeg', 0.45);
}
