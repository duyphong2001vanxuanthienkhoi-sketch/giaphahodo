/** Chuyển động của Đỗ Gia, gom về một chỗ.
 *
 * Bộ thiết kế nói ba điều bắt buộc, và cả ba đều cần một mẩu JavaScript chứ CSS
 * không tự làm được: người đã xin giảm chuyển động thì mở ra là tĩnh; phải có một
 * nút tạm dừng thật; và khi tab bị ẩn thì mọi vòng lặp phải dừng lại.
 *
 * Tất cả nói với CSS bằng hai thuộc tính trên thẻ <html>:
 *   data-motion="off"  — người dùng tắt, hoặc máy đang xin giảm chuyển động
 *   data-an="1"        — tab đang bị ẩn, dừng vòng lặp trang trí cho đỡ tốn pin
 */

import { useEffect, useRef } from 'react';

const KEY = 'do-gia-chuyen-dong';
const XIN_GIAM = '(prefers-reduced-motion: reduce)';

const xinGiam = () => { try { return matchMedia(XIN_GIAM).matches; } catch { return false; } };

/** Lựa chọn đã lưu: 'on', 'off', hoặc null khi người dùng chưa nói gì. */
function daChon() {
  try { const v = localStorage.getItem(KEY); return v === 'on' || v === 'off' ? v : null; }
  catch { return null; }
}

/** Đang bật hay không. Người dùng chọn tay thì theo người dùng; chưa chọn thì
 * theo cài đặt của máy. */
export function dangBat() {
  const chon = daChon();
  return chon ? chon === 'on' : !xinGiam();
}

function ghi(bat) {
  document.documentElement.dataset.motion = bat ? 'on' : 'off';
}

export function doiChuyenDong() {
  const bat = !dangBat();
  try { localStorage.setItem(KEY, bat ? 'on' : 'off'); } catch { /* chặn lưu trữ thì thôi */ }
  ghi(bat);
  return bat;
}

/** Gọi một lần trước khi React dựng cây, để không loé một nhịp chuyển động rồi mới tắt. */
export function khoiDong() {
  ghi(dangBat());
  const theoTab = () => { document.documentElement.dataset.an = document.hidden ? '1' : '0'; };
  theoTab();
  document.addEventListener('visibilitychange', theoTab);
  // Người dùng chưa chọn tay thì đổi cài đặt máy giữa chừng vẫn phải nghe theo.
  try { matchMedia(XIN_GIAM).addEventListener('change', () => { if (!daChon()) ghi(dangBat()); }); }
  catch { /* trình duyệt cũ không có addEventListener trên MediaQueryList */ }
}

/** Lưới ảnh và các khối dài hiện dần khi trôi vào tầm mắt — mỗi phần tử đúng một
 * lần, vì cuộn lên cuộn xuống mà cái gì cũng nhấp nháy lại thì mỏi mắt.
 *
 * CSS chỉ giấu `.mo-lo` đi khi thấy cờ `data-lodan` trên thẻ <html>, và cờ ấy chỉ
 * được bật ngay trước lúc đặt người canh. Kịch bản có hỏng thì cùng lắm là mất
 * hiệu ứng, chứ không bao giờ mất nội dung. */
export function useLoDan() {
  const canh = useRef(null);
  // Cố tình không có mảng phụ thuộc: quét lại sau mỗi lần vẽ. Thẻ mới hiện ra vì
  // vừa gõ một chữ vào ô tìm kiếm cũng là thẻ đang bị giấu đi chờ được đánh thức;
  // chỉ quét lúc đổi mục thì những thẻ ấy nằm ở độ mờ 0 vĩnh viễn.
  useEffect(() => {
    const root = document.documentElement;
    if (!('IntersectionObserver' in window) || root.dataset.motion === 'off') {
      root.dataset.lodan = '0';
      canh.current?.disconnect();
      canh.current = null;
      return;
    }
    if (!canh.current) {
      canh.current = new IntersectionObserver(muc => {
        for (const m of muc) if (m.isIntersecting) { m.target.classList.add('hien'); canh.current?.unobserve(m.target); }
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.04 });
    }
    root.dataset.lodan = '1';
    // observe() lên một phần tử đang được canh là việc rỗng, nên quét lại không tốn gì.
    for (const el of document.querySelectorAll('.mo-lo:not(.hien)')) canh.current.observe(el);
  });
  useEffect(() => () => { canh.current?.disconnect(); canh.current = null; }, []);
}

/** FLIP: đo chỗ cũ, để trình duyệt xếp lại, rồi kéo từng phần tử về chỗ cũ và thả ra.
 * Mở hay gập một nhánh làm cả đàn em phía dưới nhảy chỗ; không có bước này thì chúng
 * nhảy tức thì và mắt mất dấu người đang xem. */
export function doCho(nut) {
  const cu = new Map();
  if (nut) for (const el of nut.querySelectorAll('[data-flip]')) cu.set(el.dataset.flip, el.getBoundingClientRect());
  return cu;
}

export function chayVe(nut, cu, giay = 0.68) {
  if (!nut || !cu.size) return;
  if (document.documentElement.dataset.motion === 'off') return;
  for (const el of nut.querySelectorAll('[data-flip]')) {
    const truoc = cu.get(el.dataset.flip);
    if (!truoc) continue;
    const sau = el.getBoundingClientRect();
    const dx = truoc.left - sau.left, dy = truoc.top - sau.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
    el.animate(
      [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
      { duration: giay * 1000, easing: 'cubic-bezier(.2,.75,.25,1)' },
    );
  }
}
