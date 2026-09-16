import { useEffect, useState } from 'react';
import { ArrowRight, Mail, ShieldCheck, Leaf, ChevronLeft, KeyRound, UserPlus, Check } from 'lucide-react';
import { api } from './api.js';
import { Brand, Button, Field } from './components.jsx';

/** Ba đường vào nhà, và cả ba đều phải nhìn thấy được từ màn hình đầu tiên:
 *
 *   đăng ký   — người trong họ tự tạo tài khoản, rồi chờ người quản lý duyệt
 *   mật khẩu  — đăng nhập thường ngày, dùng chung cho cả quản lý lẫn thành viên
 *   mã email  — cho ai được mời bằng link, hoặc ai quên mật khẩu
 *
 * Trước đây ô đăng nhập ghi "Email quản lý" và nút ghi "Vào quản lý", trong khi
 * chính ô ấy là chỗ thành viên đăng nhập; còn nút đăng ký thì nằm lọt giữa mấy
 * dòng chữ nhỏ bên dưới. Nhìn vào thì tưởng cả màn hình này không dành cho mình. */
export default function Login({ config, onLogin, onBack = null }) {
  const [email, setEmail] = useState(''), [code, setCode] = useState(''), [challenge, setChallenge] = useState(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [invite, setInvite] = useState(null);
  const [password, setPassword] = useState(''), [reg, setReg] = useState({ name: '', email: '', password: '' }), [sent, setSent] = useState(false);
  // Mặc định là ô email + mật khẩu, luôn luôn. `config.passwordLogin` chỉ cho biết
  // máy chủ có đặt sẵn mật khẩu quản lý trong biến môi trường hay không — nó không
  // nói gì về tài khoản đã đăng ký, mà ai đăng ký cũng có mật khẩu của riêng mình.
  // Lấy nó ra để tắt đường này là chặn nhầm cả nhà.
  const [mode, setMode] = useState('password');
  // Máy đang chạy ở chế độ thử thì email không gửi ra ngoài mà rơi vào data/mail —
  // vẫn lấy mã được, nên đường này vẫn còn dùng được.
  const guiDuocMail = config?.emailLogin !== false || config?.mailPreview;

  const inviteToken = new URLSearchParams(location.search).get('invite') || '';
  useEffect(() => {
    if (inviteToken) api('/invitation?token=' + encodeURIComponent(inviteToken)).then(setInvite).catch(e => setError(e.message));
  }, [inviteToken]);
  // Được mời bằng link thì đi thẳng đường mã email: link đã xác nhận đúng người,
  // chỉ còn thiếu một lần gõ email cho khớp.
  useEffect(() => { if (invite) setMode('otp'); }, [invite]);

  const doi = ke => { setMode(ke); setError(''); };
  const gui = viec => async e => {
    e.preventDefault(); setError(''); setBusy(true);
    try { await viec(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const bangMaEmail = gui(async () => {
    if (challenge) {
      await api('/auth/verify', { method: 'POST', body: { challengeId: challenge, code } });
      history.replaceState(null, '', location.pathname);
      await onLogin();
    } else {
      const r = await api('/auth/request-code', { method: 'POST', body: { email, inviteToken: inviteToken || undefined } });
      setChallenge(r.challengeId);
    }
  });
  const bangMatKhau = gui(async () => {
    await api('/auth/password', { method: 'POST', body: { email, password } });
    await onLogin();
  });
  const dangKy = gui(async () => {
    await api('/auth/register', { method: 'POST', body: reg });
    setSent(true);
  });

  const tieuDe = mode === 'register' ? 'Tạo tài khoản.'
    : mode === 'otp' && challenge ? 'Một bước nữa thôi.'
    : mode === 'otp' ? 'Nhận mã qua email.'
    : 'Đăng nhập.';
  const loiDan = mode === 'register' ? 'Ai trong họ cũng đăng ký được. Người quản lý duyệt một lần là bạn vào được từ đó về sau.'
    : mode === 'otp' && challenge ? `Nhập mã 6 chữ số vừa gửi tới ${email}. Mã dùng được trong 10 phút.`
    : mode === 'otp' && invite ? `${invite.name}, bạn được mời về với ${invite.familyName}. Gõ đúng email đã được mời để tiếp tục.`
    : mode === 'otp' ? 'Hợp cho ai được mời bằng link, hoặc ai quên mật khẩu. Không cần nhớ gì cả.'
    : 'Dành cho cả người quản lý lẫn thành viên trong họ. Khách chỉ xem gia phả thì không cần đăng nhập.';

  const veXemGiaPha = onBack && <Button variant="text" className="full-width" onClick={onBack}><ChevronLeft/>Quay lại xem gia phả</Button>;
  const loiMoiDangKy = <Button variant="primary" className="full-width moi-dang-ky" onClick={() => doi('register')}>
    <UserPlus/>Chưa có tài khoản? Đăng ký
  </Button>;

  return <main className="login-screen">
    <section className="login-story">
      <Brand/>
      <div className="login-story-content">
        <div className="eyebrow">Nơi gốc rễ còn mãi</div>
        <h1>Đi qua năm tháng.<br/><em>Vẫn một nếp nhà.</em></h1>
        <p>Giữ những ngày cần nhớ.<br/>Để tình thân luôn được tiếp nối.</p>
        <div className="login-orbit" aria-hidden="true"><span/><Leaf/></div>
      </div>
      <footer>“Cây có cội, nước có nguồn.”<span>ĐỖ GIA · GÌN GIỮ NẾP NHÀ</span></footer>
    </section>

    <section className="login-form-side">
      <div className="login-mobile-brand"><Brand/></div>
      <div className="login-form-wrap">
        <span className="login-symbol">{mode === 'register' ? <UserPlus/> : mode === 'otp' ? <Mail/> : <KeyRound/>}</span>
        <p className="eyebrow">{invite ? 'Lời mời về với gia đình' : mode === 'register' ? 'Xin chào người trong họ' : 'Chào mừng trở về'}</p>
        <h2>{tieuDe}</h2>
        <p className="login-description">{loiDan}</p>

        {mode === 'register' && (sent
          ? <div className="register-done">
              <div className="success-emblem"><Check/></div>
              <p className="modal-copy">Đã gửi đăng ký cho <strong>{reg.email}</strong>. Người quản lý dòng họ sẽ duyệt trước khi bạn vào được — nhắn cho người quản lý một tiếng cho nhanh.</p>
              <Button variant="primary" className="full-width" onClick={() => { doi('password'); setSent(false); }}>Về màn đăng nhập</Button>
            </div>
          : <form onSubmit={dangKy}>
              <Field label="Họ và tên *"><input required minLength={2} maxLength={80} placeholder="Đỗ Văn Minh" value={reg.name} onChange={e => setReg({ ...reg, name: e.target.value })}/></Field>
              <Field label="Email *"><input type="email" required maxLength={254} autoComplete="email" placeholder="ban@email.com" value={reg.email} onChange={e => setReg({ ...reg, email: e.target.value })}/></Field>
              <Field label="Mật khẩu *" hint="Ít nhất 8 ký tự. Lần sau bạn đăng nhập bằng email và mật khẩu này."><input type="password" required minLength={8} maxLength={200} autoComplete="new-password" value={reg.password} onChange={e => setReg({ ...reg, password: e.target.value })}/></Field>
              {error && <p className="form-error" role="alert">{error}</p>}
              <Button type="submit" variant="primary" className="full-width" disabled={busy}>{busy ? 'Đang gửi…' : 'Gửi đăng ký'}<ArrowRight/></Button>
              {/* Nói thẳng ra chuyện quyền, để không ai chờ một thứ sẽ không tới:
                  đăng ký thì thành thành viên, còn quyền quản lý là do người quản
                  lý giao trong mục Thành viên. */}
              <p className="hint">Tài khoản mới vào với quyền <strong>thành viên</strong>: xem được danh bạ và góp ký ức. Muốn thêm, sửa người trong gia phả thì nhờ người quản lý giao quyền ở mục Thành viên. Cần duyệt là để danh bạ số điện thoại của cả nhà không lọt ra ngoài.</p>
              <Button variant="text" className="full-width" onClick={() => doi('password')}><ChevronLeft/>Tôi đã có tài khoản</Button>
            </form>)}

        {mode === 'password' && <form onSubmit={bangMatKhau}>
          <Field label="Email"><input type="email" required autoComplete="username" placeholder="ban@email.com" value={email} onChange={e => setEmail(e.target.value)} maxLength={254}/></Field>
          <Field label="Mật khẩu"><input type="password" required autoComplete="current-password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} maxLength={200}/></Field>
          {error && <p className="form-error" role="alert">{error}</p>}
          <Button type="submit" variant="primary" className="full-width" disabled={busy}>{busy ? 'Đang kiểm tra…' : 'Đăng nhập'}<ArrowRight/></Button>
          <div className="divider-label"><span>hoặc</span></div>
          {loiMoiDangKy}
          {guiDuocMail && <Button variant="text" className="full-width" onClick={() => doi('otp')}><Mail/>Gửi mã qua email cho tôi</Button>}
          {veXemGiaPha}
        </form>}

        {mode === 'otp' && <form onSubmit={bangMaEmail}>
          {challenge
            ? <Field label="Mã xác nhận"><input className="otp-input" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required placeholder="000000" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))}/></Field>
            : <Field label="Địa chỉ email"><input type="email" required autoComplete="email" placeholder="ban@email.com" value={email} onChange={e => setEmail(e.target.value)} maxLength={254}/></Field>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <Button type="submit" variant="primary" className="full-width" disabled={busy}>{busy ? 'Đang xử lý…' : challenge ? 'Xác nhận & vào Đỗ Gia' : 'Nhận mã đăng nhập'}<ArrowRight/></Button>
          {challenge && <Button variant="text" className="full-width" disabled={busy} onClick={() => { setChallenge(null); setCode(''); setError(''); }}><ChevronLeft/>Đổi email hoặc xin mã mới</Button>}
          {!challenge && <>
            <div className="divider-label"><span>hoặc</span></div>
            {loiMoiDangKy}
            <Button variant="text" className="full-width" onClick={() => doi('password')}><KeyRound/>Đăng nhập bằng mật khẩu</Button>
          </>}
          {veXemGiaPha}
        </form>}

        <p className="privacy-note"><ShieldCheck/>Thông tin dòng họ chỉ dành cho thành viên được duyệt.</p>
        {config.mailPreview && challenge && <p className="dev-note">Chế độ thử trên máy: email được lưu vào thư mục data/mail, chưa gửi ra ngoài.</p>}
      </div>
      <footer className="login-footer">Một lời nhắc nhỏ, trọn vẹn lòng thành.</footer>
    </section>
  </main>;
}
