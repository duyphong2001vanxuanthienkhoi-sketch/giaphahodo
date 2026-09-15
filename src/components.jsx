import { useEffect, useRef } from 'react';
import { X, Sprout, Bell, ArrowUpRight, MapPin, CalendarDays, ChevronLeft, ChevronRight, Check, Plus, Sparkles } from 'lucide-react';
import { monthGrid, solarLabel, lunarLabel, pad, daysBetween } from '../shared/lunar.js';

export function Brand({small=false}) {return <div className={`brand ${small?'small':''}`}><Sprout aria-hidden="true"/><span>đỗ gia.</span></div>;}
export function Avatar({name,photoId=null,size=''}) {
  if(photoId)return <span className={`avatar photo ${size}`}><img src={`/api/photos/${photoId}`} alt={`Ảnh ${name}`} loading="lazy"/></span>;
  return <span className={`avatar ${size}`} aria-hidden="true">{name.trim().split(/\s+/).slice(-2).map(s=>s[0]).join('').toUpperCase()}</span>;
}
export function Button({children,variant='',className='',...props}) {return <button className={`button ${variant} ${className}`} type="button" {...props}>{children}</button>;}
export function Empty({title,description,action}) {return <div className="empty-state"><Sprout aria-hidden="true"/><h3>{title}</h3><p>{description}</p>{action}</div>;}
export function Modal({title,eyebrow,children,onClose,wide=false}) {
  const ref=useRef(null);
  useEffect(()=>{const el=ref.current;el.showModal();return()=>{if(el.open)el.close();};},[]);
  return <dialog ref={ref} className={`modal ${wide?'wide':''}`} onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===ref.current){const b=ref.current.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)onClose();}}} aria-labelledby="modal-title"><div className="modal-heading"><div>{eyebrow&&<p className="eyebrow">{eyebrow}</p>}<h2 id="modal-title">{title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Đóng cửa sổ"><X/></button></div>{children}</dialog>;
}
export function Field({label,children,hint,wide=false}) {return <label className={`field ${wide?'full':''}`}><span>{label}</span>{children}{hint&&<small>{hint}</small>}</label>;}
export function EventRow({event,today,onOpen,onRemind,reminded=false}) {
  const away=daysBetween(today,event.date);
  return <div className="event-row"><button className="date-stamp" onClick={()=>onOpen(event)} aria-label={`Xem ngày giỗ ${event.name}`}><b>{pad(event.lunar_day)}</b><span>THÁNG {event.lunar_month}</span></button><button className="event-copy" onClick={()=>onOpen(event)}><strong>{event.name}</strong><span>{solarLabel(event.date)} <span className="dot-separator">·</span> {away===0?'Hôm nay':away>0?`Còn ${away} ngày`:'Đã qua'}</span></button>{onRemind&&<button className={`icon-button ${reminded?'active':''}`} onClick={()=>onRemind(event)} aria-label={`Cài lời nhắc cho ${event.name}`}><Bell/></button>}</div>;
}
export function ObservanceRow({event,today}) {
  const away=daysBetween(today,event.date);
  return <div className="event-row observance"><div className="date-stamp muted-stamp"><b>{pad(event.lunar_day)}</b><span>THÁNG {event.lunar_month}</span></div><div className="event-copy"><strong>{event.name}</strong><span>{solarLabel(event.date)} <span className="dot-separator">·</span> {away===0?'Hôm nay':`Còn ${away} ngày`}</span></div><Sparkles aria-hidden="true"/></div>;
}
export function EventHero({event,today,onOpen,onRemind,reminded}) {
  const days=daysBetween(today,event.date);
  return <article className="event-hero"><div className="hero-content"><div className="eyebrow"><span className="status-dot"/>Ngày giỗ gần nhất</div><h2>{event.name}</h2><p className="event-generation">Đời thứ {event.generation} <span>·</span> {event.branch}</p><p className="inline-meta"><CalendarDays/>{lunarLabel(event.date)}<span className="dot-separator">·</span>{solarLabel(event.date)}</p><p className="inline-meta location"><MapPin/>{event.location||'Chưa cập nhật địa điểm'}</p><div className="hero-actions">{onRemind&&<Button variant="primary" onClick={()=>onRemind(event)}>{reminded?<Check/>:<Bell/>}{reminded?'Đã đặt lời nhắc':'Nhắc tôi ngày này'}</Button>}<Button variant={onRemind?'text':'primary'} onClick={()=>onOpen(event)}>Xem chi tiết<ArrowUpRight/></Button></div></div><div className="countdown" aria-label={days===0?'Ngày giỗ hôm nay':`Còn ${days} ngày`}><span>{days===0?'Ngày giỗ':'Còn'}</span><b>{pad(days)}</b><span>{days===0?'Hôm nay':'Ngày nữa'}</span></div></article>;
}
export function Calendar({year,month,events,observances=[],birthdays=[],today,selected,onSelect,onMonth,compact=false}) {
  const cells=monthGrid(year,month);
  // Mỗi ngày gom cả ba loại, để ô lịch hiện thẳng tên chứ không chỉ một chấm tròn.
  const byDate=new Map();
  const put=(date,item)=>byDate.set(date,[...(byDate.get(date)||[]),item]);
  events.forEach(e=>put(e.date,{kind:'gio',label:e.name.replace(/^(Cụ|Ông|Bà|Bác|Cô|Chú|Dì|Anh|Chị) /,''),full:'Giỗ '+e.name}));
  birthdays.forEach(e=>put(e.date,{kind:'sinhnhat',label:e.name.replace(/^(Ông|Bà|Bác|Cô|Chú|Dì|Anh|Chị|Em) /,''),full:`Sinh nhật ${e.name} · tròn ${e.turning} tuổi`}));
  observances.forEach(e=>put(e.date,{kind:'viecho',label:e.name.split('·')[0].trim(),full:e.name}));
  const change=n=>{let m=month+n,y=year;if(m===0){m=12;y--;}if(m===13){m=1;y++;}if(y>=1901&&y<=2198)onMonth({year:y,month:m});};
  return <section className={`calendar-panel ${compact?'compact':''}`} aria-label={`Lịch tháng ${month} năm ${year}`}>
    <div className="calendar-heading"><h2>Tháng {month}<span>, {year}</span></h2><div className="calendar-arrows"><button className="icon-button" onClick={()=>change(-1)} disabled={year===1901&&month===1} aria-label="Tháng trước"><ChevronLeft/></button><button className="icon-button" onClick={()=>change(1)} disabled={year===2198&&month===12} aria-label="Tháng sau"><ChevronRight/></button></div></div>
    <div className="weekday-row">{['T2','T3','T4','T5','T6','T7','CN'].map(d=><span key={d}>{d}</span>)}</div>
    <div className="calendar-grid">{cells.map(cell=>{
      const list=byDate.get(cell.date)||[];
      const kinds=[...new Set(list.map(x=>x.kind))];
      return <button key={cell.date}
        className={`day-cell ${cell.outside?'outside':''} ${cell.date===today?'today':''} ${cell.date===selected?'selected':''} ${list.length?'has-event':''} ${kinds.map(k=>'has-'+k).join(' ')}`}
        aria-pressed={selected===cell.date} aria-current={cell.date===today?'date':undefined}
        aria-label={`${solarLabel(cell.date)}, ${lunarLabel(cell.date)}${list.length?'. '+list.map(x=>x.full).join('. '):''}`}
        onClick={()=>onSelect(cell.date)}>
        <span className="solar-number">{Number(cell.date.slice(-2))}</span>
        {!compact&&<span className="lunar-number">{cell.lunar.day===1?`1/${cell.lunar.month}`:cell.lunar.day}{cell.lunar.leap?'n':''}</span>}
        <span className="day-dots">{kinds.map(k=><span key={k} className={`dot ${k}`}/>)}</span>
        {!compact&&list.length>0&&<span className="day-labels">{list.slice(0,2).map((x,i)=><span key={i} className={`day-label ${x.kind}`}>{x.label}</span>)}{list.length>2&&<span className="day-label more">+{list.length-2}</span>}</span>}
      </button>;})}</div>
    <div className="calendar-legend"><span><i className="gio"/>Ngày giỗ</span><span><i className="sinhnhat"/>Sinh nhật</span><span><i className="viecho"/>Việc họ</span>{!compact&&<span>Số nhỏ: ngày âm · n: tháng nhuận</span>}</div>
  </section>;
}
export function PageHeading({eyebrow,title,description,action}) {return <header className="page-heading"><div>{eyebrow&&<p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description&&<p>{description}</p>}</div>{action}</header>;}
export function AddButton({onClick}) {return <Button variant="primary" onClick={onClick}><Plus/>Thêm ngày giỗ</Button>;}
