import { useState } from 'react';
import { Save, CalendarDays, ImagePlus, Trash2, Wand2 } from 'lucide-react';
import { Modal, Field, Button } from './components.jsx';
import { api } from './api.js';
import { preparePortrait } from './image.js';
import { occurrences, todayInVietnam, addDays, solarLabel, lunarDate, pad } from '../shared/lunar.js';

const FIELDS = ['name','generation','branch','birth_year','death_year','parent_id','lunar_day','lunar_month','leap_policy','short_month_policy','location','biography','note'];

export default function AncestorForm({ancestor,ancestors,onClose,onSaved}) {
  const [form,setForm]=useState(ancestor?Object.fromEntries(FIELDS.map(k=>[k,ancestor[k]])):{name:'',generation:3,branch:'Chi trưởng',birth_year:null,death_year:null,parent_id:null,lunar_day:1,lunar_month:1,leap_policy:'regular',short_month_policy:'last-day',location:'',biography:'',note:''});
  const [tab,setTab]=useState('basic'),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [solar,setSolar]=useState(''),[converted,setConverted]=useState(null);
  const [photo,setPhoto]=useState(null),[dropPhoto,setDropPhoto]=useState(false),[photoBusy,setPhotoBusy]=useState(false);
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  const today=todayInVietnam();
  const next=occurrences([{...form,id:'preview'}],today,addDays(today,400))[0];
  const existingPhoto=dropPhoto?null:ancestor?.photo_id;
  const preview=photo||(existingPhoto?`/api/photos/${existingPhoto}`:null);

  // Most families remember the solar date of the funeral, not the lunar one.
  function convert(iso) {
    setSolar(iso);setConverted(null);
    if(!iso)return;
    try {
      const lunar=lunarDate(iso);
      setForm(f=>({...f,lunar_day:lunar.day,lunar_month:lunar.month,death_year:Number(iso.slice(0,4))}));
      setConverted(lunar);setError('');
    } catch(e){setError(e.message);}
  }
  async function pick(event) {
    const file=event.target.files?.[0];event.target.value='';
    if(!file)return;
    setPhotoBusy(true);setError('');
    try{setPhoto(await preparePortrait(file));setDropPhoto(false);}
    catch(e){setError(e.message);}
    finally{setPhotoBusy(false);}
  }
  async function save(e) {
    e.preventDefault();setBusy(true);setError('');
    try {
      const saved=await api(ancestor?'/ancestors/'+ancestor.id:'/ancestors',{method:ancestor?'PUT':'POST',body:form});
      const id=ancestor?ancestor.id:saved.id;
      if(photo) {
        const added=await api(`/ancestors/${id}/photos`,{method:'POST',body:{data:photo,caption:''}});
        if(!added.portrait)await api(`/ancestors/${id}/portrait`,{method:'PUT',body:{photo_id:added.id}});
      } else if(dropPhoto&&ancestor?.photo_id)await api('/photos/'+ancestor.photo_id,{method:'DELETE'});
      await onSaved();onClose();
    } catch(e){setError(e.message);}finally{setBusy(false);}
  }

  return <Modal title={ancestor?'Chỉnh sửa người thân':'Ghi thêm một ngày nhớ'} eyebrow="Thông tin ngày giỗ" onClose={onClose} wide><form onSubmit={save}>
    <div className="segmented form-tabs" role="group" aria-label="Phần thông tin">
      <button type="button" className={tab==='basic'?'active':''} aria-pressed={tab==='basic'} onClick={()=>setTab('basic')}>Thông tin & ngày giỗ</button>
      <button type="button" className={tab==='memory'?'active':''} aria-pressed={tab==='memory'} onClick={()=>setTab('memory')}>Ảnh & ký ức</button>
    </div>
    <div className={tab==='basic'?'form-grid':'form-grid hidden-section'}>
      <Field label="Tên người thân *" wide><input required maxLength={120} placeholder="Ví dụ: Cụ Nguyễn Văn An" value={form.name} onChange={e=>set('name',e.target.value)}/></Field>
      <Field label="Đời thứ *"><input type="number" min="1" max="30" required value={form.generation} onChange={e=>set('generation',Number(e.target.value))}/></Field>
      <Field label="Chi / nhánh *"><input maxLength={80} required value={form.branch} onChange={e=>set('branch',e.target.value)}/></Field>
      <Field label="Năm sinh"><input type="number" min="1000" max="2199" placeholder="Không bắt buộc" value={form.birth_year??''} onChange={e=>set('birth_year',e.target.value?Number(e.target.value):null)}/></Field>
      <Field label="Năm mất"><input type="number" min="1000" max="2199" placeholder="Không bắt buộc" value={form.death_year??''} onChange={e=>set('death_year',e.target.value?Number(e.target.value):null)}/></Field>
      <div className="form-section-title full"><CalendarDays/><span>Ngày giỗ theo âm lịch</span></div>
      <Field label="Chỉ nhớ ngày dương?" wide hint="Nhập ngày mất theo dương lịch, Cội tự điền ngày âm bên dưới.">
        <div className="convert-row"><input type="date" min="1900-01-01" max="2199-12-31" value={solar} onChange={e=>convert(e.target.value)}/><span className="convert-arrow"><Wand2 aria-hidden="true"/></span><span className="convert-result">{converted?`${pad(converted.day)}/${pad(converted.month)}${converted.leap?' nhuận':''} âm lịch`:'—'}</span></div>
      </Field>
      {converted?.leap&&<p className="hint full">Ngày dương bạn nhập rơi vào tháng nhuận. Hãy chọn quy ước tháng nhuận bên dưới cho đúng nếp nhà.</p>}
      <Field label="Ngày âm *"><select value={form.lunar_day} onChange={e=>set('lunar_day',Number(e.target.value))}>{Array.from({length:30},(_,i)=><option key={i+1} value={i+1}>Ngày {i+1}</option>)}</select></Field>
      <Field label="Tháng âm *"><select value={form.lunar_month} onChange={e=>set('lunar_month',Number(e.target.value))}>{Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>Tháng {i+1}</option>)}</select></Field>
      <Field label="Khi có tháng nhuận" hint="Chọn theo nếp riêng của gia đình."><select value={form.leap_policy} onChange={e=>set('leap_policy',e.target.value)}><option value="regular">Làm giỗ ở tháng thường</option><option value="prefer-leap">Ưu tiên tháng nhuận nếu có</option><option value="both">Nhắc ở cả hai tháng</option></select></Field>
      <Field label="Ngày 30 trong tháng thiếu" hint="Áp dụng khi tháng chỉ có 29 ngày."><select value={form.short_month_policy} onChange={e=>set('short_month_policy',e.target.value)}><option value="last-day">Chuyển về ngày cuối tháng</option><option value="skip">Bỏ qua tháng không có ngày 30</option></select></Field>
      <div className="date-preview full">{next?<>Lần giỗ gần nhất: <strong>{solarLabel(next.date)}</strong>{next.shifted?' · Đã chuyển về ngày 29':''}</>:'Không có ngày phù hợp trong 400 ngày tới.'}</div>
      <Field label="Địa điểm" wide><input maxLength={300} placeholder="Nhà thờ họ hoặc địa chỉ làm giỗ" value={form.location} onChange={e=>set('location',e.target.value)}/></Field>
      <Field label="Liên kết với thế hệ trước" wide hint="Một liên kết cha/mẹ hoặc người thuộc thế hệ trước để sắp xếp gia phả tưởng nhớ."><select value={form.parent_id||''} onChange={e=>set('parent_id',e.target.value||null)}><option value="">Chưa liên kết</option>{ancestors.filter(p=>p.id!==ancestor?.id&&p.generation<form.generation).map(p=><option key={p.id} value={p.id}>{p.name} · Đời {p.generation}</option>)}</select></Field>
    </div>
    <div className={tab==='memory'?'form-grid':'form-grid hidden-section'}>
      <div className="photo-field full">
        <div className="photo-preview">{preview?<img src={preview} alt={`Ảnh ${form.name||'người thân'}`}/>:<span>Chưa có ảnh</span>}</div>
        <div className="photo-actions">
          <label className="button"><ImagePlus/>{photoBusy?'Đang xử lý…':preview?'Đổi ảnh đại diện':'Chọn ảnh đại diện'}<input type="file" accept="image/*" hidden disabled={photoBusy} onChange={pick}/></label>
          {preview&&<Button variant="text" onClick={()=>{setPhoto(null);setDropPhoto(true);}}><Trash2/>Bỏ ảnh</Button>}
          <small>Ảnh được thu nhỏ ngay trên máy bạn trước khi gửi đi, và mọi thông tin ẩn trong ảnh — kể cả vị trí chụp — đều được loại bỏ.</small>
          <small>Muốn thêm nhiều ảnh thì mở trang riêng của người thân, phần <strong>Album ảnh</strong>.</small>
        </div>
      </div>
      <Field label="Ký ức về người thân" wide hint="Những câu chuyện, lời căn dặn hoặc điều con cháu muốn gìn giữ."><textarea rows={7} maxLength={5000} placeholder="Gia đình nhớ về…" value={form.biography} onChange={e=>set('biography',e.target.value)}/></Field>
      <Field label="Ghi chú ngày giỗ" wide><textarea rows={3} maxLength={2000} placeholder="Giờ tập trung, người phụ trách, chuẩn bị hương hoa…" value={form.note} onChange={e=>set('note',e.target.value)}/></Field>
    </div>
    {error&&<p className="form-error" role="alert">{error}</p>}
    <footer className="modal-actions"><Button onClick={onClose} disabled={busy}>Hủy</Button><Button variant="primary" type="submit" disabled={busy||photoBusy}><Save/>{busy?'Đang lưu…':'Lưu ngày giỗ'}</Button></footer>
  </form></Modal>;
}
