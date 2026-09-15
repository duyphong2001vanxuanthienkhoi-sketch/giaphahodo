import { useState } from 'react';
import { CalendarDays, MapPin, BookHeart, Bell, Edit3, Trash2, Check, X, Send, Clock3, Users, HelpCircle, ImagePlus, Star, ChevronLeft, GitBranch, Images } from 'lucide-react';
import { api } from './api.js';
import { Avatar, Button, Modal, Empty } from './components.jsx';
import { preparePortrait } from './image.js';
import { pad, solarLabel, lunarLabel } from '../shared/lunar.js';

const CHOICES = [['yes','Có, tôi về',Check],['maybe','Chưa chắc',HelpCircle],['no','Tôi không về được',X]];
const LABELS = {yes:'Về được',maybe:'Chưa chắc',no:'Không về được'};
const shortDate = at => new Date(at.includes('Z')?at:at+'Z').toLocaleDateString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'});

export default function PersonPage({ person, events, data, admin, today, go, onEdit, onDeleteRequest, onRemind, reload, notify }) {
  const [draft,setDraft]=useState(''),[note,setNote]=useState(null),[busy,setBusy]=useState(false),[uploading,setUploading]=useState(false),[error,setError]=useState(''),[viewing,setViewing]=useState(null);
  const photos=data.photos.filter(p=>p.ancestor_id===person.id);
  const memories=data.memories.filter(m=>m.ancestor_id===person.id);
  const approved=memories.filter(m=>m.status==='approved'), pending=memories.filter(m=>m.status==='pending');
  const next=events[0];
  const responses=next?data.attendance.filter(a=>a.ancestor_id===person.id&&a.event_date===next.date):[];
  const mine=responses.find(a=>a.user_id===data.user.id);
  const find=id=>id?data.ancestors.find(a=>a.id===id):null;
  const parent=find(person.parent_id), spouse=find(person.spouse_id);
  // The other parent is reached through the linked elder's marriage.
  const elders=[parent,parent&&find(parent.spouse_id)].filter(Boolean);
  const children=data.ancestors.filter(a=>a.parent_id===person.id);
  const relation=p=><button key={p.id} className="relation-link" onClick={()=>go('person/'+p.id)}><Avatar name={p.name} photoId={p.photo_id}/><span>{p.name}<small>Đời thứ {p.generation}</small></span></button>;

  async function act(run,message){setBusy(true);setError('');try{await run();await reload();if(message)notify(message);}catch(e){setError(e.message);}finally{setBusy(false);}}
  const submit=e=>{e.preventDefault();act(async()=>{
    const result=await api(`/ancestors/${person.id}/memories`,{method:'POST',body:{body:draft}});
    setDraft('');
    notify(result.status==='approved'?'Đã thêm ký ức vào trang người thân.':'Đã gửi ký ức. Người quản lý sẽ duyệt trước khi hiển thị.');
  });};
  const answer=status=>act(()=>api('/attendance/'+person.id,{method:'PUT',body:{status,note:note??mine?.note??'',event_date:next.date}}),'Đã ghi nhận câu trả lời của bạn.');
  async function addPhotos(event) {
    const files=[...(event.target.files||[])];event.target.value='';
    if(!files.length)return;
    setUploading(true);setError('');
    let added=0;
    try {
      for(const file of files) {
        await api(`/ancestors/${person.id}/photos`,{method:'POST',body:{data:await preparePortrait(file),caption:''}});
        added++;
      }
      await reload();notify(added===1?'Đã thêm ảnh vào album.':`Đã thêm ${added} ảnh vào album.`);
    } catch(e) {
      setError(added?`Đã thêm ${added} ảnh rồi dừng lại: ${e.message}`:e.message);
      if(added)await reload();
    } finally { setUploading(false); }
  }

  return <>
    <button className="back-link" onClick={()=>go('family')}><ChevronLeft/>Về gia phả</button>
    <header className="person-hero">
      <div className="person-portrait">
        {person.photo_id
          ? <button onClick={()=>setViewing(photos.find(p=>p.id===person.photo_id)||photos[0])} aria-label={`Xem ảnh lớn của ${person.name}`}><img src={`/api/photos/${person.photo_id}`} alt={`Ảnh ${person.name}`}/></button>
          : <span className="portrait-empty"><Avatar name={person.name} size="large"/></span>}
      </div>
      <div className="person-headline">
        <p className="eyebrow">Đời thứ {person.generation} · {person.branch}</p>
        <h1>{person.name}</h1>
        <p className="life-years">{person.birth_year||'…'} — {person.death_year||'…'}</p>
        <p className="inline-meta"><CalendarDays/>Giỗ {pad(person.lunar_day)}/{pad(person.lunar_month)} âm lịch{person.leap_policy==='both'?' · cả tháng nhuận':''}</p>
        <p className="inline-meta location"><MapPin/>{person.location||'Chưa cập nhật địa điểm'}</p>
        <div className="hero-actions">
          <Button variant="primary" onClick={()=>onRemind(person)}><Bell/>Lời nhắc ngày giỗ</Button>
          {admin&&<Button onClick={onEdit}><Edit3/>Chỉnh sửa</Button>}
          {admin&&<button className="icon-button danger" aria-label={`Xóa ${person.name}`} onClick={onDeleteRequest}><Trash2/></button>}
        </div>
      </div>
      {next&&<div className="countdown" aria-label={next.daysAway===0?'Ngày giỗ hôm nay':`Còn ${next.daysAway} ngày`}>
        <span>{next.daysAway===0?'Ngày giỗ':'Còn'}</span><b>{pad(next.daysAway)}</b><span>{next.daysAway===0?'Hôm nay':'Ngày nữa'}</span>
      </div>}
    </header>
    {error&&<p className="form-error" role="alert">{error}</p>}

    <div className="person-body">
      <div className="person-main">
        <section className="person-section">
          <div className="section-bar"><h2><Images/>Album ảnh{photos.length?` · ${photos.length}`:''}</h2>
            {admin&&<label className="button"><ImagePlus/>{uploading?'Đang tải lên…':'Thêm ảnh'}<input type="file" accept="image/*" multiple hidden disabled={uploading} onChange={addPhotos}/></label>}</div>
          {photos.length===0
            ? <p className="muted">{admin?'Chưa có ảnh nào. Thêm ảnh để con cháu nhớ mặt người.':'Gia đình chưa thêm ảnh về người thân này.'}</p>
            : <div className="photo-grid">{photos.map(photo=><figure key={photo.id} className={photo.id===person.photo_id?'portrait':''}>
                <button onClick={()=>setViewing(photo)} aria-label={photo.caption||`Xem ảnh của ${person.name}`}><img src={`/api/photos/${photo.id}`} alt={photo.caption||`Ảnh ${person.name}`} loading="lazy"/></button>
                {photo.id===person.photo_id&&<span className="portrait-flag"><Star/>Ảnh đại diện</span>}
                {photo.caption&&<figcaption>{photo.caption}</figcaption>}
              </figure>)}</div>}
        </section>

        <section className="person-section">
          <div className="section-bar"><h2><BookHeart/>Miền ký ức</h2></div>
          {person.biography&&<p className="person-biography">{person.biography}</p>}
          {!person.biography&&approved.length===0&&pending.length===0&&<p className="muted">Chưa có ai kể lại điều gì về người thân này. Bạn có thể là người đầu tiên.</p>}
          {approved.map(m=><article key={m.id} className="memory-entry">
            <p>{m.body}</p>
            <footer><Avatar name={m.author_name}/><div><strong>{m.author_name}</strong><span>{shortDate(m.created_at)}</span></div>
              {(admin||m.author_id===data.user.id)&&<button className="icon-button danger" aria-label="Xóa ký ức này" disabled={busy} onClick={()=>act(()=>api('/memories/'+m.id,{method:'DELETE'}),'Đã xóa ký ức.')}><Trash2/></button>}</footer>
          </article>)}
          {pending.map(m=><article key={m.id} className="memory-entry pending">
            <span className="pill"><Clock3/>{admin?'Chờ bạn duyệt':'Đang chờ duyệt'}</span>
            <p>{m.body}</p>
            <footer><Avatar name={m.author_name}/><div><strong>{m.author_name}</strong><span>{shortDate(m.created_at)}</span></div>
              {admin?<div className="memory-review">
                <Button variant="text" disabled={busy} onClick={()=>act(()=>api('/memories/'+m.id,{method:'PATCH',body:{status:'rejected'}}),'Đã ẩn ký ức này.')}>Từ chối</Button>
                <Button variant="primary" disabled={busy} onClick={()=>act(()=>api('/memories/'+m.id,{method:'PATCH',body:{status:'approved'}}),'Đã đăng ký ức cho cả nhà cùng đọc.')}><Check/>Duyệt</Button>
              </div>:<button className="icon-button danger" aria-label="Thu hồi ký ức" disabled={busy} onClick={()=>act(()=>api('/memories/'+m.id,{method:'DELETE'}),'Đã thu hồi ký ức.')}><Trash2/></button>}</footer>
          </article>)}
          <form className="memory-compose" onSubmit={submit}>
            <label className="field full"><span>Bạn nhớ gì về {person.name}?</span>
              <textarea rows={4} minLength={10} maxLength={4000} required placeholder="Một kỷ niệm, một lời dặn, một thói quen của người…" value={draft} onChange={e=>setDraft(e.target.value)}/></label>
            <div className="compose-footer"><small>{admin?'Ký ức bạn viết sẽ hiển thị ngay.':'Người quản lý sẽ duyệt trước khi cả nhà cùng đọc.'}</small>
              <Button variant="primary" type="submit" disabled={busy||draft.trim().length<10}><Send/>{busy?'Đang gửi…':'Gửi ký ức'}</Button></div>
          </form>
        </section>
      </div>

      <aside className="person-aside">
        {next&&<section className="person-section">
          <div className="section-bar"><h2><CalendarDays/>Ngày giỗ sắp tới</h2></div>
          <div className="detail-date"><CalendarDays/><div><strong>{solarLabel(next.date,{weekday:'long',day:'numeric',month:'long'})}</strong><p>{lunarLabel(next.date)}{next.shifted?' · Làm giỗ vào ngày cuối tháng':''}</p></div></div>
          {events.length>1&&<p className="hint">Lần sau nữa: {solarLabel(events[1].date)}</p>}
          <h3><Users/>Bạn có về được không?</h3>
          <div className="attend-choices">{CHOICES.map(([value,label,Icon])=><button key={value} type="button" className={`attend-choice ${mine?.status===value?'active':''}`} aria-pressed={mine?.status===value} disabled={busy} onClick={()=>answer(value)}><Icon/>{label}</button>)}</div>
          <label className="field full"><span>Nhắn thêm cho gia đình</span>
            <input maxLength={200} placeholder="Ví dụ: cháu về từ chiều hôm trước." value={note??mine?.note??''} onChange={e=>setNote(e.target.value)}
              onBlur={()=>{if(mine&&note!==null&&note!==mine.note)answer(mine.status);}}/></label>
          <div className="attend-list">
            {responses.length===0?<p className="muted">Chưa ai trả lời. Bạn trả lời trước để cả nhà cùng biết.</p>
              :responses.map(a=><div key={a.user_id} className={`attend-row ${a.status}`}><Avatar name={a.user_name}/><div><strong>{a.user_name}</strong>{a.note&&<span>{a.note}</span>}</div><span className="pill">{LABELS[a.status]}</span></div>)}
          </div>
        </section>}
        {person.note&&<section className="person-section"><div className="section-bar"><h2>Ghi chú ngày giỗ</h2></div><p className="person-note">{person.note}</p></section>}
        <section className="person-section">
          <div className="section-bar"><h2><GitBranch/>Trong gia phả</h2></div>
          <div className="relation-list">
            <div><span className="relation-label">Thế hệ trước</span>{elders.length?elders.map(relation):<p className="muted">Chưa liên kết.</p>}</div>
            <div><span className="relation-label">Vợ / chồng</span>{spouse?relation(spouse):<p className="muted">Chưa liên kết.</p>}</div>
            <div><span className="relation-label">Thế hệ sau</span>{children.length?children.map(relation):<p className="muted">Chưa có ai được liên kết.</p>}</div>
          </div>
        </section>
      </aside>
    </div>

    {viewing&&<Modal title={viewing.caption||person.name} eyebrow={`Ảnh ${shortDate(viewing.created_at)}`} onClose={()=>setViewing(null)} wide>
      <div className="lightbox"><img src={`/api/photos/${viewing.id}`} alt={viewing.caption||`Ảnh ${person.name}`}/></div>
      {admin&&<>
        <label className="field full"><span>Chú thích ảnh</span>
          <input maxLength={200} placeholder="Ví dụ: Cụ chụp cùng con cháu, Tết 1992." defaultValue={viewing.caption}
            onBlur={e=>e.target.value!==viewing.caption&&act(()=>api('/photos/'+viewing.id,{method:'PATCH',body:{caption:e.target.value}}),'Đã lưu chú thích.')}/></label>
        <footer className="modal-actions spread">
          <Button variant="text" className="danger" disabled={busy} onClick={()=>act(async()=>{await api('/photos/'+viewing.id,{method:'DELETE'});setViewing(null);},'Đã xóa ảnh.')}><Trash2/>Xóa ảnh</Button>
          {viewing.id!==person.photo_id&&<Button variant="primary" disabled={busy} onClick={()=>act(()=>api(`/ancestors/${person.id}/portrait`,{method:'PUT',body:{photo_id:viewing.id}}),'Đã đặt làm ảnh đại diện.')}><Star/>Đặt làm ảnh đại diện</Button>}
        </footer>
      </>}
    </Modal>}
  </>;
}

export function PersonMissing({ go }) {
  return <Empty title="Không tìm thấy người thân này." description="Có thể bản ghi đã được chuyển vào thùng rác, hoặc đường dẫn không còn đúng." action={<Button onClick={()=>go('family')}>Về gia phả</Button>}/>;
}
