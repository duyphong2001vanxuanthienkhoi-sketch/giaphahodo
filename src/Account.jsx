import { useState } from 'react';
import { Bell, ShieldCheck, Save, Landmark, Download, Trash2, RotateCcw, Sparkles, Phone, ScrollText } from 'lucide-react';
import { api } from './api.js';
import { Avatar, Button, Field, PageHeading, Modal } from './components.jsx';
import CalendarSync from './CalendarSync.jsx';
import { pad, OBSERVANCES } from '../shared/lunar.js';

const REMINDER_DAYS = [0,1,3,7,14,30];
const AUDIT_LABELS = {'tai-khoan-moi':'Tài khoản mới','dang-nhap':'Đăng nhập','dang-nhap-that-bai':'Đăng nhập trượt','moi-thanh-vien':'Mời thành viên','doi-quyen':'Đổi quyền','thu-hoi-truy-cap':'Thu hồi'};
const dayLabel = day => day===0?'Đúng ngày':`Trước ${day} ngày`;

export default function Account({data,reload,notify,initialTab='profile'}) {
  const [tab,setTab]=useState(initialTab),[profile,setProfile]=useState({name:data.user.name,phone:data.user.phone,share_phone:data.user.share_phone}),[prefs,setPrefs]=useState(data.preferences);
  const [family,setFamily]=useState({name:data.family.name,home:data.family.home,observances:data.family.observances||[]});
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[confirm,setConfirm]=useState(null);
  const admin=data.user.role==='admin';
  async function save(e,path,body){e.preventDefault();setBusy(true);setError('');try{await api(path,{method:'PATCH',body});await reload();notify('Đã lưu thay đổi của bạn.');}catch(e){setError(e.message);}finally{setBusy(false);}}
  function toggleDay(day){setPrefs(p=>({...p,days:p.days.includes(day)?p.days.filter(x=>x!==day):[...p.days,day]}));}
  function toggleRite(key){setFamily(f=>({...f,observances:f.observances.includes(key)?f.observances.filter(x=>x!==key):[...f.observances,key]}));}
  async function act(){setBusy(true);setError('');try{await api(confirm.path,{method:confirm.method});await reload();setConfirm(null);notify(confirm.done);}catch(e){setError(e.message);}finally{setBusy(false);}}

  return <><PageHeading eyebrow="Không gian của bạn" title="Tài khoản & lời nhắc" description="Một vài lựa chọn nhỏ để luôn nhớ đúng ngày."/>
    <div className="account-layout">
      <aside className="profile-panel"><Avatar name={data.user.name} size="large"/><h2>{data.user.name}</h2><p>{data.user.email}</p><span className="pill"><ShieldCheck/>{admin?'Người quản lý':'Thành viên'}</span><div className="profile-family"><Landmark/><span>{data.family.name}</span></div>
        <div className="account-tabs">{[['profile','Thông tin cá nhân'],['reminders','Nhắc lịch & điện thoại'],...(admin?[['family','Thông tin dòng họ'],['data','Dữ liệu & thùng rác']]:[])].map(([id,label])=><button key={id} className={tab===id?'active':''} onClick={()=>{setTab(id);setError('');}} aria-pressed={tab===id}>{label}</button>)}</div>
      </aside>
      <section className="settings-panel">
        {error&&<p className="form-error" role="alert">{error}</p>}

        {tab==='profile'&&<form onSubmit={e=>save(e,'/profile',profile)}>
          <div className="settings-title"><h2>Thông tin cá nhân</h2><p>Cách tên bạn xuất hiện với các thành viên trong dòng họ.</p></div>
          <div className="form-grid">
            <Field label="Họ và tên *" wide><input required minLength={2} maxLength={80} value={profile.name} onChange={e=>setProfile({...profile,name:e.target.value})}/></Field>
            <Field label="Email đăng nhập" wide hint="Email đã được xác minh và dùng để nhận lời nhắc."><input type="email" value={data.user.email} readOnly/></Field>
            <Field label="Số điện thoại" wide hint="Không bắt buộc. Mặc định chỉ mình bạn thấy."><input type="tel" maxLength={25} autoComplete="tel" value={profile.phone} onChange={e=>setProfile({...profile,phone:e.target.value})}/></Field>
          </div>
          <label className="switch-row"><div><strong><Phone/>Cho người trong họ thấy số của tôi</strong><p>Để cả nhà gọi được cho nhau khi lo việc họ. Người ngoài dòng họ không thấy.</p></div><input type="checkbox" className="switch" checked={profile.share_phone} disabled={!profile.phone.trim()} onChange={e=>setProfile({...profile,share_phone:e.target.checked})}/></label>
          <div className="settings-footer"><Button type="submit" variant="primary" disabled={busy}><Save/>{busy?'Đang lưu…':'Lưu thông tin'}</Button></div>
        </form>}

        {tab==='reminders'&&<>
          <form onSubmit={e=>save(e,'/preferences',{enabled:prefs.enabled,days:prefs.days,hour:prefs.hour,minute:prefs.minute,all_events:prefs.all_events})}>
            <div className="settings-title"><h2>Để không lỡ một ngày nhớ</h2><p>Chọn thời điểm nhắc. Đỗ Gia dùng đúng lựa chọn này cho cả email và lịch trên điện thoại.</p></div>
            <label className="switch-row"><div><strong>Bật nhắc lịch ngày giỗ</strong><p>Lời nhắc qua email {data.user.email}</p></div><input type="checkbox" className="switch" checked={prefs.enabled} onChange={e=>setPrefs({...prefs,enabled:e.target.checked})}/></label>
            <fieldset disabled={!prefs.enabled}><legend>Nhắc trước bao lâu?</legend>
              <div className="reminder-day-options">{REMINDER_DAYS.map(day=><label key={day} className={prefs.days.includes(day)?'checked':''}><input type="checkbox" checked={prefs.days.includes(day)} onChange={()=>toggleDay(day)}/><span>{dayLabel(day)}</span></label>)}</div>
              <div className="form-grid" style={{marginTop:25}}>
                <Field label="Giờ nhận nhắc" hint="Múi giờ Việt Nam · UTC+7"><div className="time-inputs"><select aria-label="Giờ nhận nhắc" value={prefs.hour} onChange={e=>setPrefs({...prefs,hour:Number(e.target.value)})}>{Array.from({length:24},(_,i)=><option key={i} value={i}>{pad(i)}</option>)}</select><span>:</span><select aria-label="Phút nhận nhắc" value={prefs.minute} onChange={e=>setPrefs({...prefs,minute:Number(e.target.value)})}>{Array.from({length:60},(_,i)=><option key={i} value={i}>{pad(i)}</option>)}</select></div></Field>
                <Field label="Những ngày cần nhắc"><select value={prefs.all_events?'all':'selected'} onChange={e=>setPrefs({...prefs,all_events:e.target.value==='all'})}><option value="all">Tất cả ngày giỗ của dòng họ</option><option value="selected">Chỉ người thân tôi theo dõi</option></select></Field>
              </div>
              {!prefs.all_events&&<p className="hint">Bạn đang theo dõi {data.subscriptions.length} người thân. Bấm biểu tượng chuông ở ngày giỗ để chọn người cần nhắc.</p>}
            </fieldset>
            <div className="settings-footer"><Button variant="primary" type="submit" disabled={busy}><Bell/>{busy?'Đang lưu…':'Lưu cài đặt nhắc'}</Button></div>
            {data.demo&&<div className="info-note"><ShieldCheck/>Bản dùng thử chỉ lưu lựa chọn, không gửi email thật.</div>}
          </form>
          <CalendarSync calendar={data.calendar} preferences={data.preferences} notify={notify} reload={reload}/>
          {data.deliveries.length>0&&<section className="delivery-history"><h3>Lời nhắc gần đây</h3>{data.deliveries.map(d=><div key={d.id}><span>{d.name}</span><span className="muted">{d.status==='sent'?'Đã gửi':d.status==='failed'?'Gửi chưa thành công':'Đang gửi'}</span></div>)}</section>}
        </>}

        {tab==='family'&&admin&&<form onSubmit={e=>save(e,'/family',family)}>
          <div className="settings-title"><h2>Thông tin dòng họ</h2><p>Được dùng chung cho các thành viên của gia đình.</p></div>
          <div className="form-grid">
            <Field label="Tên dòng họ *" wide><input required minLength={2} maxLength={100} value={family.name} onChange={e=>setFamily({...family,name:e.target.value})}/></Field>
            <Field label="Nhà thờ họ / nơi sum họp" wide><textarea rows={3} maxLength={300} value={family.home} onChange={e=>setFamily({...family,home:e.target.value})}/></Field>
          </div>
          <fieldset><legend><Sparkles/>Ngày lệ của dòng họ</legend>
            <p className="hint">Những ngày này hiện trên lịch và trong lịch đã đăng ký trên điện thoại. Đỗ Gia không gửi email cho ngày lệ, để hộp thư của cả nhà không bị đầy.</p>
            <div className="rite-options">{OBSERVANCES.map(rite=><label key={rite.key} className={family.observances.includes(rite.key)?'checked':''}><input type="checkbox" checked={family.observances.includes(rite.key)} onChange={()=>toggleRite(rite.key)}/><span>{rite.name}</span></label>)}</div>
          </fieldset>
          <div className="settings-footer"><Button type="submit" variant="primary" disabled={busy}><Save/>{busy?'Đang lưu…':'Lưu thông tin dòng họ'}</Button></div>
        </form>}

        {tab==='data'&&admin&&<>
          <div className="settings-title"><h2>Dữ liệu của dòng họ</h2><p>Bản sao để gia đình tự giữ, và nơi tìm lại những gì đã lỡ xóa.</p></div>
          <div className="data-export"><div><strong>Tải toàn bộ dữ liệu</strong><p>Một tệp JSON gồm gia phả, ký ức, thành viên và điểm danh. Ảnh chân dung nằm trong bản sao lưu của máy chủ, không nằm trong tệp này.</p></div><a className="button" href="/api/export.json"><Download/>Tải tệp JSON</a></div>
          <section className="trash-panel">
            <h3><ScrollText/>Nhật ký quản trị</h3>
            {!data.auditLog?.length?<p className="muted">Chưa có gì được ghi lại.</p>
              :<div className="audit-list">{data.auditLog.map(row=><div className="audit-row" key={row.id}>
                <span className={`audit-tag ${row.action}`}>{AUDIT_LABELS[row.action]||row.action}</span>
                <div><strong>{row.actor||'—'}</strong>{row.detail&&<span>{row.detail}</span>}</div>
                <small>{new Date(row.created_at+'Z').toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}</small>
              </div>)}</div>}
            <p className="hint">Giữ lại 100 việc gần nhất; bản ghi quá một năm được dọn tự động. Địa chỉ IP lưu dưới dạng băm, không lưu IP thật.</p>
          </section>
          <section className="trash-panel">
            <h3><Trash2/>Thùng rác</h3>
            {data.trash.length===0?<p className="muted">Thùng rác đang trống. Người thân bị xóa sẽ nằm ở đây cho tới khi bạn xóa hẳn.</p>
              :data.trash.map(person=><div className="trash-row" key={person.id}>
                <div><strong>{person.name}</strong><span>Đời thứ {person.generation}{person.branch&&person.branch!=='Chưa phân chi'?' · '+person.branch:''} · giỗ {pad(person.lunar_day)}/{pad(person.lunar_month)} âm</span><small>Đã xóa {new Date(person.deleted_at).toLocaleDateString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}</small></div>
                <div className="trash-actions">
                  <Button variant="text" disabled={busy} onClick={()=>setConfirm({title:'Khôi phục người thân?',description:`${person.name} sẽ trở lại gia phả, lịch ngày giỗ và miền ký ức như cũ.`,path:`/ancestors/${person.id}/restore`,method:'POST',label:'Khôi phục',done:'Đã khôi phục người thân.'})}><RotateCcw/>Khôi phục</Button>
                  <Button variant="text" className="danger" disabled={busy} onClick={()=>setConfirm({title:'Xóa hẳn khỏi Đỗ Gia?',description:`Toàn bộ thông tin, ảnh và ký ức về ${person.name} sẽ mất vĩnh viễn. Không thể hoàn tác.`,path:'/trash/'+person.id,method:'DELETE',label:'Xóa vĩnh viễn',done:'Đã xóa hẳn bản ghi.',danger:true})}><Trash2/>Xóa hẳn</Button>
                </div>
              </div>)}
          </section>
        </>}
      </section>
    </div>
    {confirm&&<Modal title={confirm.title} onClose={()=>setConfirm(null)}>
      <p className="modal-copy">{confirm.description}</p>
      {error&&<p className="form-error" role="alert">{error}</p>}
      <footer className="modal-actions"><Button onClick={()=>setConfirm(null)} disabled={busy}>Hủy</Button><Button variant={confirm.danger?'danger-fill':'primary'} onClick={act} disabled={busy}>{busy?'Đang xử lý…':confirm.label}</Button></footer>
    </Modal>}
  </>;
}
