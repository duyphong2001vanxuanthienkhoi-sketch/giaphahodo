import { useState } from 'react';
import { CalendarPlus, Copy, Check, RefreshCw, QrCode, ShieldAlert, Smartphone, Download, Info } from 'lucide-react';
import { api } from './api.js';
import { Button, Modal } from './components.jsx';

export default function CalendarSync({ calendar, preferences, notify, reload }) {
  const [feed,setFeed]=useState(calendar),[version,setVersion]=useState(0),[qr,setQr]=useState(false),[confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[copied,setCopied]=useState(false);
  const alarms=preferences.enabled&&preferences.days.length
    ? preferences.days.map(d=>d===0?'đúng ngày':`trước ${d} ngày`).join(' · ')
    : null;
  async function copy(){
    try{await navigator.clipboard.writeText(feed.url);setCopied(true);setTimeout(()=>setCopied(false),2500);notify('Đã sao chép link lịch.');}
    catch{setError('Trình duyệt không cho sao chép tự động. Hãy chọn và sao chép đường dẫn bên dưới.');}
  }
  async function rotate(){
    setBusy(true);setError('');
    try{const next=await api('/calendar-token',{method:'POST'});setFeed(next);setVersion(v=>v+1);setConfirm(false);await reload();notify('Đã tạo link lịch mới. Hãy đăng ký lại trên các thiết bị của bạn.');}
    catch(e){setError(e.message);}finally{setBusy(false);}
  }
  return <section className="calendar-sync">
    <div className="settings-title"><h2>Nối thẳng vào lịch điện thoại</h2><p>Đăng ký một lần. Lịch tự cập nhật khi gia đình thêm hoặc sửa ngày giỗ.</p></div>
    <div className="sync-primary">
      <a className="button primary full-width" href={feed.webcal}><CalendarPlus/>Thêm vào lịch điện thoại</a>
      <p className="hint">Mở link này ngay trên điện thoại. Máy sẽ hỏi bạn có muốn đăng ký lịch không.</p>
    </div>
    <div className="sync-row">
      <Button onClick={copy}>{copied?<Check/>:<Copy/>}{copied?'Đã sao chép':'Sao chép link cho Google Lịch'}</Button>
      <Button onClick={()=>setQr(true)}><QrCode/>Hiện mã QR</Button>
      <a className="button" href="/api/calendar.ics"><Download/>Tải tệp .ics một lần</a>
    </div>
    <label className="field full"><span>Link lịch riêng của bạn</span><textarea rows={3} readOnly value={feed.url} onFocus={e=>e.target.select()}/></label>
    {error&&<p className="form-error" role="alert">{error}</p>}
    <div className={`info-note ${alarms?'':'warn'}`}>
      {alarms?<><Check/><span>Lịch sẽ tự báo <strong>{alarms}</strong> lúc {String(preferences.hour).padStart(2,'0')}:{String(preferences.minute).padStart(2,'0')}, theo đúng cài đặt nhắc ở trên.</span></>
        :<><Info/><span>Bạn đang tắt nhắc lịch, nên lịch đăng ký sẽ chỉ hiện ngày giỗ mà không đổ chuông. Bật nhắc ở phần trên để điện thoại tự báo.</span></>}
    </div>
    <details className="sync-help">
      <summary><Smartphone/>Cách làm trên từng loại máy</summary>
      <dl>
        <dt>iPhone / iPad</dt><dd>Mở link ở trên bằng Safari ngay trên máy, rồi bấm <strong>Đăng ký</strong>. Báo thức của Đỗ Gia được giữ nguyên.</dd>
        <dt>Android / Google Lịch</dt><dd>Sao chép link, mở <strong>calendar.google.com</strong> trên máy tính, vào <strong>Lịch khác → Từ URL</strong> rồi dán vào. Google bỏ qua báo thức có sẵn, nên hãy vào phần cài đặt của lịch vừa thêm để đặt thông báo cho riêng nó.</dd>
        <dt>Outlook</dt><dd>Vào <strong>Thêm lịch → Đăng ký từ web</strong> rồi dán link.</dd>
      </dl>
      <p className="hint">Điện thoại tự kiểm tra lịch mới sau mỗi vài giờ đến một ngày, tùy máy — không đổi ngay lập tức sau khi gia đình sửa.</p>
    </details>
    <div className="sync-danger">
      <p><ShieldAlert/><span>Ai có link này đều đọc được tên người thân, ngày giỗ và địa điểm. Chỉ giữ cho riêng bạn; nếu lỡ gửi nhầm, hãy tạo link mới.</span></p>
      <Button variant="text" onClick={()=>setConfirm(true)}><RefreshCw/>Tạo link mới</Button>
    </div>
    {qr&&<Modal title="Quét để thêm vào điện thoại" eyebrow="Mã QR link lịch của bạn" onClose={()=>setQr(false)}>
      <p className="modal-copy">Mở camera trên điện thoại và quét mã này. Máy sẽ mở link đăng ký lịch.</p>
      <div className="qr-frame"><img src={`/api/calendar-qr.svg?v=${version}`} alt="Mã QR chứa link lịch ngày giỗ của bạn"/></div>
      <p className="hint">Mã chứa link riêng của bạn. Đừng chụp màn hình gửi cho người ngoài gia đình.</p>
      <footer className="modal-actions"><Button variant="primary" onClick={()=>setQr(false)}>Xong</Button></footer>
    </Modal>}
    {confirm&&<Modal title="Tạo link lịch mới?" onClose={()=>setConfirm(false)}>
      <p className="modal-copy">Link cũ sẽ ngừng hoạt động ngay. Mọi thiết bị đang dùng link cũ sẽ không nhận được cập nhật nữa, và bạn cần đăng ký lại bằng link mới.</p>
      {error&&<p className="form-error" role="alert">{error}</p>}
      <footer className="modal-actions"><Button onClick={()=>setConfirm(false)} disabled={busy}>Giữ link cũ</Button><Button variant="primary" onClick={rotate} disabled={busy}><RefreshCw/>{busy?'Đang tạo…':'Tạo link mới'}</Button></footer>
    </Modal>}
  </section>;
}
