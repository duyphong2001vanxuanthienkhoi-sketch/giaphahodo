const MAX_EDGE = 1024, TARGET_BYTES = 360 * 1024;

/** WebP nhỏ hơn JPEG chừng một phần ba ở cùng mức nhìn, và máy chủ nhận cả hai. Trình
 * duyệt nào không biết WebP thì toDataURL trả về PNG, nên cứ nhìn vào thứ nó trả về mà
 * quyết, đừng hỏi trình duyệt là nó hỗ trợ gì. */
function chonDinhDang(canvas) {
  try { return canvas.toDataURL('image/webp', 0.8).startsWith('data:image/webp') ? 'image/webp' : 'image/jpeg'; }
  catch { return 'image/jpeg'; }
}

/** Downscaling through a canvas re-encodes the pixels and drops every EXIF tag with them,
 * including the GPS coordinates an old family photo may still be carrying.
 *
 * Ảnh máy điện thoại bây giờ nặng 4–8 MB. Nén ngay tại máy trước khi gửi thì máy chủ,
 * kho ảnh và cả gói cước của người gửi đều nhẹ đi, mà ảnh chân dung xem trên điện thoại
 * thì 1024px đã quá đủ. */
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
  // Ảnh PNG có nền trong; nền trắng để chỗ trong suốt không thành đen khi đổi sang JPEG.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const kieu = chonDinhDang(canvas);
  for (const quality of [0.82, 0.7, 0.6, 0.5]) {
    const data = canvas.toDataURL(kieu, quality);
    if (data.length * 0.75 < TARGET_BYTES) return data;
  }
  return canvas.toDataURL(kieu, 0.45);
}
