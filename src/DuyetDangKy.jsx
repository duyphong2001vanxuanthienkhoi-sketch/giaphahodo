import { useState } from 'react';
import { Check, Clock3 } from 'lucide-react';
import { api } from './api.js';
import { Button, Modal } from './components.jsx';

/** Duyệt người mới đăng ký.
 *
 * Nằm ở hai chỗ vì hai chỗ ấy phục vụ hai lúc khác nhau: trong mục Thành viên là
 * khi người quản lý chủ động đi xem ai đang chờ, còn trong mục Tài khoản là khi
 * họ chỉ tiện tay mở điện thoại ra. Trên điện thoại, Thành viên nằm sau nút menu
 * ba gạch, còn Tài khoản thì có sẵn một ô ở thanh dưới — mà việc duyệt thì không
 * nên bắt ai phải đi tìm: người đăng ký đang chờ ở đầu kia.
 *
 * Một bản dựng, hai chỗ gọi. Hai bản chép tay là sớm muộn cũng lệch nhau. */
export default function DuyetDangKy({ data, reload, notify, tieuDe = 'Đăng ký chờ duyệt' }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [hoi, setHoi] = useState(null);
  const admin = data.user.role === 'admin';
  const cho = admin ? (data.pendingMembers || []) : [];

  async function lam() {
    setBusy(true); setError('');
    try {
      await api(hoi.path, { method: hoi.method, body: hoi.body });
      await reload();
      setHoi(null);
      notify(hoi.xong);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  if (!admin) return null;
  return <section className="pending-invites">
    <div className="section-bar">
      <h2><Clock3/>{tieuDe}</h2>
      {cho.length > 0 && <span className="pill">{cho.length} người</span>}
    </div>
    {cho.length === 0
      ? <p className="muted">Chưa có ai đang chờ. Người trong họ tự đăng ký ở màn đăng nhập, và sẽ hiện ra đây.</p>
      : <>
        <p className="hint">Người tự đăng ký chưa vào được cho tới khi bạn duyệt. Chỉ duyệt người bạn thật sự biết — duyệt xong là họ xem được số điện thoại của cả họ.</p>
        {cho.map(m => <div className="invite-row" key={m.id}>
          <div>
            <strong>{m.name}</strong>
            <p>{m.email}</p>
            <small>Đăng ký {new Date(m.created_at + 'Z').toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</small>
          </div>
          <div className="trash-actions">
            <Button variant="text" onClick={() => { setError(''); setHoi({
              title: 'Từ chối đăng ký?',
              description: `${m.name} (${m.email}) sẽ bị thu hồi quyền truy cập và không vào được.`,
              path: '/members/' + m.id, method: 'PATCH', body: { active: false }, xong: 'Đã từ chối đăng ký.' }); }}>Từ chối</Button>
            <Button variant="primary" onClick={() => { setError(''); setHoi({
              title: 'Duyệt tài khoản này?',
              description: `${m.name} (${m.email}) sẽ vào được và xem được danh bạ số điện thoại của người trong họ.`,
              path: '/members/' + m.id + '/approve', method: 'POST', xong: `Đã duyệt ${m.name}.` }); }}><Check/>Duyệt</Button>
          </div>
        </div>)}
      </>}
    {error && !hoi && <p className="form-error" role="alert">{error}</p>}
    {hoi && <Modal title={hoi.title} onClose={() => setHoi(null)}>
      <p className="modal-copy">{hoi.description}</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <footer className="modal-actions">
        <Button onClick={() => setHoi(null)}>Hủy</Button>
        <Button variant="primary" onClick={lam} disabled={busy}>{busy ? 'Đang cập nhật…' : 'Xác nhận'}</Button>
      </footer>
    </Modal>}
  </section>;
}
