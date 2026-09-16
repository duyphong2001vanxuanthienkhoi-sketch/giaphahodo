/** Sáng hay tối, quyết theo giờ Việt Nam chứ không theo giờ máy: dòng họ ở Việt Nam,
 * và người đi xa mở ra vẫn muốn thấy đúng cái buổi mà ở nhà đang sống.
 *
 * Sáu giờ sáng tới sáu giờ chiều là giao diện Ngà cổ; ngoài khoảng đó là nền tối.
 * Ai muốn chọn tay thì lựa chọn được ghi lại và thắng giờ giấc. */

const KEY = 'do-gia-giao-dien';
export const LUA_CHON = ['auto', 'light', 'dark'];
export const TEN = { auto: 'Theo giờ', light: 'Sáng', dark: 'Tối' };

const MAU_THANH = { light: '#f6f1e7', dark: '#191c17' };

/** Giờ hiện tại ở Việt Nam, 0–23. */
export function gioVietNam(now = new Date()) {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', hour12: false }).format(now));
}

export const theoGio = (now = new Date()) => (gioVietNam(now) >= 6 && gioVietNam(now) < 18 ? 'light' : 'dark');

export function docLuaChon() {
  try { const v = localStorage.getItem(KEY); return LUA_CHON.includes(v) ? v : 'auto'; }
  catch { return 'auto'; }   // trình duyệt chặn lưu trữ thì coi như chưa chọn gì
}

export function luuLuaChon(chon) {
  try { chon === 'auto' ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, chon); } catch { /* không lưu được thì thôi */ }
}

/** Đổi nền, chữ và viền cùng một lúc trong khoảng nửa giây, thay vì cả trang nháy
 * một cái sang màu khác. Lớp này chỉ sống đúng lúc đang đổi rồi gỡ đi: bắt mọi
 * phần tử phải canh màu suốt đời là bắt trình duyệt làm việc thừa. */
let henMau;
function chuyenMau(root) {
  if (!root.dataset.theme) return;                 // lần đầu mở trang thì chưa có gì để chuyển
  if (root.dataset.motion === 'off') return;       // đã xin giảm chuyển động
  root.classList.add('dang-doi-mau');
  clearTimeout(henMau);
  henMau = setTimeout(() => root.classList.remove('dang-doi-mau'), 620);
}

/** Đặt giao diện lên thẻ <html> và trả về giao diện đang dùng. */
export function apDung(chon = docLuaChon(), now = new Date()) {
  const dang = chon === 'auto' ? theoGio(now) : chon;
  const root = document.documentElement;
  if (root.dataset.theme !== dang) { chuyenMau(root); root.dataset.theme = dang; }
  const the = document.querySelector('meta[name="theme-color"]');
  if (the && the.content !== MAU_THANH[dang]) the.content = MAU_THANH[dang];
  return dang;
}
