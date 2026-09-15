import { useEffect, useMemo, useState } from 'react';
import { LayoutDashboard, CalendarDays, GitBranch, BookHeart, Users, Settings, LogOut, LogIn, Bell, Moon, SunMedium, Menu, X, Sun, ChevronRight, Plus, Search, MapPin, Trash2, List, Calendar, ArrowUpRight, Check, Leaf, Heart, Mail, RefreshCw, Smartphone, Clock3, Sparkles, Contact, Cake, Phone } from 'lucide-react';
import { TongQuan, LichNgayGio, GiaPha, NguoiConSong, MienKyUc, ThanhVien, TaiKhoan, MenuIcon, Khac, MuiTenPhai } from './icons.jsx';
import { api } from './api.js';
import { apDung, docLuaChon, luuLuaChon, LUA_CHON, TEN } from './theme.js';
import { addDays, lunarDate, lunarLabel, lunarYearName, monthGrid, occurrences, observanceEvents, birthdayEvents, pad, solarLabel, todayInVietnam } from '../shared/lunar.js';
import { Avatar, Brand, Button, Calendar as CalendarView, Empty, EventHero, EventRow, ObservanceRow, Modal, PageHeading, AddButton } from './components.jsx';
import Login from './Login.jsx';
import AncestorForm from './AncestorForm.jsx';
import PersonPage, { PersonMissing } from './PersonPage.jsx';
import Account from './Account.jsx';
import Members from './Members.jsx';
import FamilyTree from './FamilyTree.jsx';

const mobileTabs=[['overview','Tổng quan',TongQuan],['calendar','Lịch giỗ',LichNgayGio],['family','Gia phả',GiaPha],['memories','Ký ức',MienKyUc]];
const navigation=[['overview','Tổng quan',TongQuan],['calendar','Lịch ngày giỗ',LichNgayGio],['family','Gia phả',GiaPha],['living','Người còn sống',NguoiConSong],['memories','Miền ký ức',MienKyUc],['members','Thành viên',ThanhVien]];
// "#person/<id>" gives every person a real address the family can bookmark and share.
const parseHash=()=>{
  const raw=location.hash.slice(1).split('?')[0]||'overview';
  const slash=raw.indexOf('/');
  return slash<0?{section:raw,param:''}:{section:raw.slice(0,slash),param:decodeURIComponent(raw.slice(slash+1))};
};
const GUEST_PREFS={enabled:false,days:[],hour:7,minute:0,all_events:true};
/** Bản công khai thiếu mọi thứ về người còn sống. Đổ vào đúng khuôn của bản thành viên
 * với giá trị rỗng, để các thành phần dùng chung không cần biết ai đang xem. */
const asGuest = pub => ({...pub, guest:true, demo:false, calendar:null,
  user:{id:null,name:'Khách',email:'',phone:'',share_phone:false,role:'guest',family_id:null},
  members:[],preferences:GUEST_PREFS,subscriptions:[],attendance:[],trash:[],invitations:[],deliveries:[]});

export default function App(){
  const [config,setConfig]=useState(null),[data,setData]=useState(null),[loading,setLoading]=useState(true),[fatal,setFatal]=useState('');
  const [route,setRoute]=useState(parseHash),[mobileMenu,setMobileMenu]=useState(false),[toast,setToast]=useState(''),[modal,setModal]=useState(null),[accountTab,setAccountTab]=useState('profile');
  const [month,setMonth]=useState(()=>{const t=todayInVietnam();return {year:Number(t.slice(0,4)),month:Number(t.slice(5,7))};}),[selected,setSelected]=useState(todayInVietnam()),[calendarMode,setCalendarMode]=useState('grid');
  const [search,setSearch]=useState(''),[branch,setBranch]=useState('all'),[busy,setBusy]=useState(false),[actionError,setActionError]=useState('');
  const [showLogin,setShowLogin]=useState(false);
  // Giao diện: 'auto' theo giờ Việt Nam, hoặc do người dùng chốt cứng.
  const [giaoDien,setGiaoDien]=useState(docLuaChon),[dangDung,setDangDung]=useState(apDung);
  useEffect(()=>{
    setDangDung(apDung(giaoDien));
    if(giaoDien!=='auto')return;
    // Soát mỗi phút để đúng 6h và 18h giao diện tự đổi, không cần tải lại trang.
    const nhip=setInterval(()=>setDangDung(apDung('auto')),60000);
    return()=>clearInterval(nhip);
  },[giaoDien]);
  function doiGiaoDien(){const ke=LUA_CHON[(LUA_CHON.indexOf(giaoDien)+1)%LUA_CHON.length];luuLuaChon(ke);setGiaoDien(ke);}
  async function loadPublic(){const pub=await api('/public').catch(()=>null);setData(pub?.family?asGuest(pub):null);}
  async function reload(){try{const d=await api('/bootstrap');setData(d);setShowLogin(false);setFatal('');}catch(e){if(e.status===401){await loadPublic();return;}throw e;}}
  useEffect(()=>{let live=true;Promise.all([api('/config'),api('/bootstrap').catch(e=>{if(e.status===401)return null;throw e;})]).then(async([c,d])=>{
    if(!live)return;
    setConfig(c);
    if(d)setData(d); else {const pub=await api('/public').catch(()=>null); if(live)setData(pub?.family?asGuest(pub):null);}
  }).catch(e=>{if(live)setFatal(e.message);}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[]);
  useEffect(()=>{const handle=()=>{setRoute(parseHash());setMobileMenu(false);setSearch('');setBranch('all');scrollTo({top:0});};window.addEventListener('hashchange',handle);return()=>window.removeEventListener('hashchange',handle);},[]);
  useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(''),4500);return()=>clearTimeout(timer);},[toast]);
  useEffect(()=>{if(!data)return;const interval=setInterval(()=>reload().catch(()=>{}),60000);return()=>clearInterval(interval);},[!!data]);
  const today=data?.today||todayInVietnam();
  const rites=data?.family?.observances||[];
  // Bootstrap polls every minute and hands back fresh arrays; key the scans on the values.
  const riteKey=rites.join(',');
  const events=useMemo(()=>data?occurrences(data.ancestors,today,addDays(today,400)):[],[data?.ancestors,today]);
  const upcomingRites=useMemo(()=>data?observanceEvents(riteKey?riteKey.split(','):[],today,addDays(today,400)):[],[riteKey,today]);
  const grid=useMemo(()=>monthGrid(month.year,month.month),[month]);
  const monthEvents=useMemo(()=>data?occurrences(data.ancestors,grid[0].date,grid.at(-1).date):[],[data?.ancestors,grid]);
  const monthRites=useMemo(()=>data?observanceEvents(riteKey?riteKey.split(','):[],grid[0].date,grid.at(-1).date):[],[riteKey,grid]);
  const monthBirthdays=useMemo(()=>data?birthdayEvents(data.ancestors,grid[0].date,grid.at(-1).date):[],[data?.ancestors,grid]);
  const upcomingBirthdays=useMemo(()=>data?birthdayEvents(data.ancestors,today,addDays(today,400)):[],[data?.ancestors,today]);
  const upcoming=events[0];
  const remindActive=id=>data.preferences.enabled&&(data.preferences.all_events||data.subscriptions.includes(id));
  useEffect(()=>{
    const context=document.modelContext;
    if(!context?.registerTool||!data)return;
    const lifecycle=new AbortController();
    const register=async()=>{
      await context.registerTool({name:'list_upcoming_memorials',title:'Xem ngày giỗ sắp tới',description:'Trả về các ngày giỗ sắp tới của dòng họ đang mở trong Đỗ Gia.',inputSchema:{type:'object',properties:{limit:{type:'integer',minimum:1,maximum:20}},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute:({limit=10}={})=>events.slice(0,Math.min(limit,20)).map(e=>({name:e.name,solarDate:e.date,lunarDate:`${e.lunar_day}/${e.lunar_month}${e.lunar.leap?' nhuận':''}`,daysAway:e.daysAway,location:e.location||null}))},{signal:lifecycle.signal});
      await context.registerTool({name:'save_my_reminder_preferences',title:'Lưu cài đặt nhắc lịch',description:'Lưu thời điểm và phạm vi nhắc ngày giỗ cho thành viên hiện tại.',inputSchema:{type:'object',properties:{enabled:{type:'boolean'},days:{type:'array',items:{type:'integer',enum:[0,1,3,7,14,30]},maxItems:6},hour:{type:'integer',minimum:0,maximum:23},minute:{type:'integer',minimum:0,maximum:59},all_events:{type:'boolean'}},required:['enabled','days','hour','minute','all_events'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:async input=>{await api('/preferences',{method:'PATCH',body:input});await reload();setToast('Đã lưu cài đặt nhắc lịch.');return {ok:true,enabled:input.enabled,days:input.days,hour:input.hour,minute:input.minute,allEvents:input.all_events};}},{signal:lifecycle.signal});
    };
    Promise.resolve(register()).catch(()=>{});
    return()=>lifecycle.abort();
  },[!!data,events]);
  function go(next){location.hash=next;setMobileMenu(false);}
  function openDetail(person){setActionError('');setModal(null);go('person/'+person.id);}
  function openReminder(person){setActionError('');setModal({type:'reminder',person});}
  function openAdd(){setActionError('');setModal({type:'edit'});}
  function openSettings(tab='reminders'){setModal(null);setAccountTab(tab);go('account');}
  async function logout(){try{await api('/auth/logout',{method:'POST'});setModal(null);go('overview');await loadPublic();}catch(e){setToast(e.message);}}
  async function saveSubscription(){setBusy(true);setActionError('');try{await api('/subscriptions/'+modal.person.id,{method:'PUT',body:{enabled:!data.subscriptions.includes(modal.person.id)}});await reload();setToast('Đã cập nhật người thân bạn theo dõi.');setModal(null);}catch(e){setActionError(e.message);}finally{setBusy(false);}}
  async function deletePerson(){setBusy(true);setActionError('');try{await api('/ancestors/'+modal.person.id,{method:'DELETE'});setModal(null);if(route.section==='person')go('family');await reload();setToast('Đã chuyển vào thùng rác. Bạn có thể khôi phục trong Tài khoản.');}catch(e){setActionError(e.message);}finally{setBusy(false);}}
  if(loading)return <Waking/>;
  if(fatal&&!config)return <div className="fatal"><Brand/><h1>Chưa kết nối được với Đỗ Gia.</h1><p>{fatal}</p><Button variant="primary" onClick={()=>location.reload()}><RefreshCw/>Thử lại</Button></div>;
  if(!data||showLogin)return <Login config={config} onLogin={reload} onBack={data?()=>setShowLogin(false):null}/>;
  const guest=!!data.guest;
  const admin=data.user.role==='admin';
  const selectedEvents=monthEvents.filter(e=>e.date===selected);
  const selectedRites=monthRites.filter(e=>e.date===selected);
  const section=route.section;
  const activePerson=section==='person'?data.ancestors.find(p=>p.id===route.param):null;
  const activeLabel=activePerson?activePerson.name:[...navigation,['account','Tài khoản & nhắc lịch']].find(x=>x[0]===section)?.[1]||'Tổng quan';
  const matches=p=>(branch==='all'||p.branch===branch)&&(p.name+' '+p.biography).toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi'));
  const departed=data.ancestors.filter(p=>!p.living);
  const alive=data.ancestors.filter(p=>p.living);
  const filteredPeople=departed.filter(matches);
  const filteredAlive=alive.filter(matches);
  const filteredAll=data.ancestors.filter(matches);
  const generations=new Set(data.ancestors.map(p=>p.generation)).size;
  const pendingMemories=data.memories.filter(m=>m.status==='pending');
  const approvedFor=id=>data.memories.filter(m=>m.ancestor_id===id&&m.status==='approved');
  const personEvent=p=>events.find(e=>e.id===p.id)||p;
  function personCard(p){return <button className={`ancestor-node ${p.living?'living':''}`} onClick={()=>openDetail(personEvent(p))}><Avatar name={p.name} photoId={p.photo_id}/><strong>{p.name}</strong><span>{p.living?(p.birth_year?`Sinh ${p.birth_year}`:'Còn sống'):`${p.birth_year||'…'} — ${p.death_year||'…'}`}</span><small>{p.living?`Đời thứ ${p.generation}`:`Giỗ ${pad(p.lunar_day)}/${pad(p.lunar_month)} âm`}</small></button>;}
  // Ô lọc chi chỉ có ích khi dòng họ đã chia chi. Chưa chia thì nó là một ô chọn cao
  // 56px với đúng một lựa chọn, đẩy cả cây xuống dưới màn hình điện thoại.
  const branches=[...new Set(data.ancestors.map(a=>a.branch))];
  const peopleFilters=<div className="people-filters"><label className="search-field"><Search/><input aria-label="Tìm người thân" placeholder="Tìm người thân…" value={search} onChange={e=>setSearch(e.target.value)}/></label>{branches.length>1&&<select aria-label="Lọc theo chi" value={branch} onChange={e=>setBranch(e.target.value)}><option value="all">Tất cả chi</option>{branches.map(b=><option key={b}>{b}</option>)}</select>}</div>;
  const empty=<Empty title="Thêm một người, giữ một ngày nhớ." description={admin?'Bắt đầu bằng tên người thân và ngày giỗ theo âm lịch.':'Người quản lý sẽ cập nhật những ngày giỗ của gia đình tại đây.'} action={admin&&<AddButton onClick={openAdd}/>}/>;
  const memoryPeople=filteredPeople.filter(p=>p.biography||approvedFor(p.id).length);
  return <div className="app-shell"><a className="skip-link" href="#main-content" onClick={e=>{e.preventDefault();document.getElementById('main-content').focus();}}>Đến nội dung chính</a>{mobileMenu&&<button className="nav-overlay" aria-label="Đóng menu" onClick={()=>setMobileMenu(false)}/>}<aside className={`sidebar ${mobileMenu?'open':''}`}><div className="sidebar-top"><button className="brand-link" onClick={()=>go('overview')} aria-label="Về tổng quan Đỗ Gia"><Brand/></button><span className="brand-tagline">NƠI GỐC RỄ CÒN MÃI</span></div><div className="clan-badge"><span className="clan-initial">{data.family.name.replace('Dòng họ ','')[0]}</span><div><strong>{data.family.name}</strong><small>{data.members.length} thành viên</small></div></div><div className="nav-section-label">KHÔNG GIAN GIA ĐÌNH</div><nav aria-label="Điều hướng chính">{navigation.filter(([id])=>!guest||(id!=='members'&&id!=='living')).map(([id,label,Icon])=><button key={id} className={`nav-link ${section===id?'active':''}`} onClick={()=>go(id)} aria-current={section===id?'page':undefined}><Icon/><span>{label}</span>{id==='calendar'&&<small>{events.filter(e=>e.daysAway<30).length}</small>}{id==='memories'&&admin&&pendingMemories.length>0&&<small className="badge-pending">{pendingMemories.length}</small>}{section===id&&<MuiTenPhai className="nav-caret"/>}</button>)}</nav><div className="sidebar-bottom"><div className="sidebar-quote"><Leaf/><p>“Cây có cội,<br/>nước có nguồn.”</p></div>{guest?<button className="nav-link highlight" onClick={()=>setShowLogin(true)}><LogIn/>Đăng nhập · Đăng ký</button>:<><button className={`nav-link ${section==='account'?'active':''}`} onClick={()=>openSettings('profile')}><Settings/>Tài khoản & lời nhắc</button><button className="sidebar-profile" onClick={()=>openSettings('profile')}><Avatar name={data.user.name}/><span><strong>{data.user.name}</strong><small>{admin?'Người quản lý':'Thành viên gia đình'}</small></span><ChevronRight/></button><button className="logout" onClick={logout}><LogOut/>Đăng xuất</button></>}</div></aside><nav className="mobile-tabs" aria-label="Điều hướng nhanh">{mobileTabs.map(([id,label,Icon])=><button key={id} className={`tab ${section===id?'active':''}`} onClick={()=>go(id)} aria-current={section===id?'page':undefined}><span className="tab-ico"><Icon/></span><span>{label}</span></button>)}<button className={`tab ${mobileMenu?'active':''}`} onClick={()=>setMobileMenu(true)} aria-expanded={mobileMenu}><span className="tab-ico"><Khac/></span><span>Khác</span></button></nav><div className="workspace"><header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-toggle" onClick={()=>setMobileMenu(true)} aria-label="Mở menu"><Menu/></button><span>Gia đình</span><ChevronRight/><strong>{activeLabel}</strong></div><div className="topbar-right"><span className="today-label"><Sun/>{solarLabel(today,{weekday:'long',day:'numeric',month:'long'})}</span><button className="icon-button theme-toggle" onClick={doiGiaoDien} aria-label={`Giao diện ${TEN[giaoDien].toLowerCase()}. Bấm để đổi.`} title={giaoDien==='auto'?`Theo giờ Việt Nam — đang ${dangDung==='light'?'sáng':'tối'}`:`Giao diện ${TEN[giaoDien].toLowerCase()}`}>{giaoDien==='auto'?<Clock3/>:giaoDien==='light'?<SunMedium/>:<Moon/>}</button>{guest&&<Button variant="primary" className="topbar-login" onClick={()=>setShowLogin(true)}><LogIn/>Đăng nhập</Button>}{!guest&&<><button className="icon-button" aria-label="Cài đặt thông báo" onClick={()=>openSettings()}><Bell/></button><button className="profile-mini" aria-label="Tài khoản của tôi" onClick={()=>openSettings('profile')}><Avatar name={data.user.name}/></button></>}</div></header>{data.demo&&<div className="demo-banner"><span><Leaf/>Bạn đang khám phá Đỗ Gia bằng dữ liệu minh họa.</span><button onClick={logout}>Đăng nhập dòng họ của tôi<ArrowUpRight/></button></div>}<main id="main-content" tabIndex={-1} className="main-content">
      {section==='overview'&&<><div className="overview-heading"><div><p className="eyebrow">{guest?'Nơi dòng họ gìn giữ những ngày cần nhớ':`Chào ${data.user.name.split(' ').at(-1)}, mừng bạn trở về`}</p><h1>Gìn giữ nếp nhà.<br/><em>Kết nối thế hệ.</em></h1><p className="intro-caption">Một lời nhắc nhỏ, trọn vẹn lòng thành.</p></div><div className="overview-aside"><span className="pill"><span className="status-dot"/>Tháng {lunarDate(today).month} âm · {lunarYearName(today)}</span>{admin&&<Button onClick={openAdd}><Plus/>Thêm ngày giỗ</Button>}</div></div>{upcoming?<EventHero event={upcoming} today={today} onOpen={openDetail} onRemind={guest?undefined:openReminder} reminded={remindActive(upcoming.id)}/>:empty}<div className="overview-lower"><section className="upcoming-panel"><div className="section-bar"><h2>Những ngày cần nhớ</h2><Button variant="text" onClick={()=>go('calendar')}>Xem lịch<ArrowUpRight/></Button></div>{events.slice(1,4).map(event=><EventRow key={event.key} event={event} today={today} onOpen={openDetail} onRemind={guest?undefined:openReminder} reminded={remindActive(event.id)}/>)}{events.length<=1&&<p className="muted">Những ngày giỗ tiếp theo sẽ được hiển thị tại đây.</p>}{upcomingRites.length>0&&<><div className="section-bar tight"><h3><Sparkles/>Việc họ sắp tới</h3></div>{upcomingRites.slice(0,2).map(rite=><ObservanceRow key={rite.key} event={rite} today={today}/>)}</>}{guest?<div className="guest-cta"><div><strong>Bạn là người trong họ?</strong><span>Đăng nhập để xem sơ đồ gia phả đầy đủ, số điện thoại liên lạc và sinh nhật của người trong họ.</span></div><Button variant="primary" onClick={()=>setShowLogin(true)}><LogIn/>Đăng nhập · Đăng ký</Button></div>:<div className="family-strip"><div className="avatar-stack">{data.members.slice(0,3).map(m=><Avatar key={m.id} name={m.name}/>)}</div><div><strong>Cùng nhau giữ một nếp nhà.</strong><span>{data.members.length} thành viên · {data.ancestors.length} người thân được tưởng nhớ</span></div><Heart/></div>}</section><CalendarView {...month} events={monthEvents} observances={monthRites} birthdays={monthBirthdays} today={today} selected={selected} onSelect={date=>{setSelected(date);go('calendar');}} onMonth={setMonth} compact/></div></>}
      {section==='calendar'&&<><PageHeading eyebrow="Mỗi năm, một lần trở về" title="Lịch ngày giỗ" description="Âm lịch để nhớ ngày. Dương lịch để sắp xếp." action={admin&&<AddButton onClick={openAdd}/>}/><div className="calendar-toolbar"><div className="segmented"><button className={calendarMode==='grid'?'active':''} aria-pressed={calendarMode==='grid'} onClick={()=>setCalendarMode('grid')}><Calendar/>Lịch tháng</button><button className={calendarMode==='list'?'active':''} aria-pressed={calendarMode==='list'} onClick={()=>setCalendarMode('list')}><List/>Sắp tới</button></div><div className="toolbar-actions"><Button onClick={()=>{setMonth({year:Number(today.slice(0,4)),month:Number(today.slice(5,7))});setSelected(today);}}>Hôm nay</Button><Button variant="primary" onClick={()=>openSettings('reminders')}><Smartphone/>Nối với lịch điện thoại</Button></div></div>{calendarMode==='grid'?<div className="full-calendar-layout"><CalendarView {...month} events={monthEvents} observances={monthRites} birthdays={monthBirthdays} today={today} selected={selected} onSelect={setSelected} onMonth={setMonth}/><aside className="day-detail"><p className="eyebrow">Ngày đang chọn</p><h2>{Number(selected.slice(-2))}<span> / {selected.slice(5,7)}</span></h2><p className="muted">{lunarLabel(selected)}</p><div className="day-detail-events">{selectedRites.map(rite=><article key={rite.key} className="rite-card"><span className="pill rite"><Sparkles/>Việc họ</span><h3>{rite.name}</h3></article>)}{selectedEvents.length?selectedEvents.map(event=><article key={event.key}><span className="pill">Ngày giỗ</span><h3>{event.name}</h3><p>Đời thứ {event.generation}{event.branch&&event.branch!=='Chưa phân chi'?' · '+event.branch:''}</p><p className="inline-meta"><MapPin/>{event.location||'Chưa cập nhật địa điểm'}</p>{event.shifted&&<p className="hint">Gia đình chọn ngày 29 do tháng này không có ngày 30.</p>}<Button variant="primary" onClick={()=>openDetail(event)}>Xem chi tiết<ArrowUpRight/></Button></article>):!selectedRites.length&&<div className="quiet-day"><Leaf/><p>Chưa có ngày giỗ<br/>được ghi lại vào ngày này.</p></div>}</div></aside></div>:<section className="list-calendar">{events.length?events.slice(0,40).map(event=><EventRow key={event.key} event={event} today={today} onOpen={openDetail} onRemind={guest?undefined:openReminder} reminded={remindActive(event.id)}/>):empty}</section>}<p className="calendar-footnote">Lịch tính theo múi giờ Việt Nam. Ngày giỗ tháng nhuận và tháng thiếu theo lựa chọn của gia đình.</p></>}
      {section==='family'&&<><PageHeading eyebrow="Từ một gốc, nhiều thế hệ" title="Sơ đồ gia phả" description={`${data.ancestors.length} người · ${generations} đời · ${departed.length} người đã khuất.`} action={admin&&<AddButton onClick={openAdd} label="Thêm người"/>}/>{peopleFilters}{!data.ancestors.length?empty:search||branch!=='all'?<div className="ancestor-card-grid">{filteredAll.map(p=><div key={p.id}>{personCard(p)}</div>)}{!filteredAll.length&&<p className="muted">Không tìm thấy người thân phù hợp.</p>}</div>:<><div className="tree-legend"><span><i className="departed"/>Đã khuất</span><span><i className="living"/>Còn sống</span><span className="muted">Chạm tên để xem trang riêng</span></div><FamilyTree people={data.ancestors} onOpen={p=>openDetail(personEvent(p))}/></>}<p className="calendar-footnote">{guest?'Khách xem được phần tưởng nhớ. Người còn sống trong họ chỉ hiện ra sau khi đăng nhập.':'Anh chị em xếp theo thứ tự sinh trong nhà. Ai chưa có thứ tự thì xếp xuống cuối.'}</p></>}
      {section==='memories'&&<><PageHeading eyebrow="Có những điều còn mãi" title="Miền ký ức" description="Những câu chuyện giữ người thân ở lại trong lòng con cháu."/>{admin&&pendingMemories.length>0&&<div className="review-banner"><Clock3/><span><strong>{pendingMemories.length} ký ức đang chờ bạn duyệt.</strong> Mở người thân tương ứng để đọc và duyệt.</span></div>}{peopleFilters}<div className="memory-grid">{memoryPeople.map((p,i)=>{const shared=approvedFor(p.id);return <article className={`memory-card tone-${i%3}`} key={p.id}><span className="memory-quote">“</span><p className="memory-excerpt">{p.biography||shared[0].body}</p>{shared.length>0&&<span className="memory-count"><BookHeart/>{shared.length} ký ức của con cháu</span>}<footer><Avatar name={p.name} photoId={p.photo_id}/><div><h2>{p.name}</h2><span>Đời thứ {p.generation}{p.branch&&p.branch!=='Chưa phân chi'?' · '+p.branch:''}</span></div><button className="icon-button" aria-label={`Đọc ký ức về ${p.name}`} onClick={()=>openDetail(personEvent(p))}><ArrowUpRight/></button></footer></article>;})}</div>{!memoryPeople.length&&<Empty title="Ký ức bắt đầu từ một câu chuyện." description="Mở một người thân trong gia phả và gửi kỷ niệm của bạn. Cả nhà sẽ cùng đọc được." action={<Button onClick={()=>go('family')}>Đến gia phả</Button>}/>}</>}
      {section==='living'&&!guest&&<><PageHeading eyebrow="Gọi được cho nhau khi cần" title="Người còn sống" description="Danh bạ trong họ. Chỉ thành viên đã đăng nhập mới xem được." action={admin&&<AddButton onClick={openAdd}/>}/>{peopleFilters}
        {!filteredAlive.length?<Empty title="Chưa có ai trong danh bạ." description={admin?'Thêm người thân và bật “Người này còn sống” để họ hiện ở đây.':'Người quản lý sẽ cập nhật danh bạ của dòng họ tại đây.'} action={admin&&<AddButton onClick={openAdd}/>}/>
          :<div className="living-grid">{filteredAlive.map(p=>{
            const bd=upcomingBirthdays.find(b=>b.id===p.id);
            return <article className="living-card" key={p.id}>
              <button className="living-head" onClick={()=>openDetail(p)}><Avatar name={p.name} photoId={p.photo_id}/><div><strong>{p.name}</strong><span>Đời thứ {p.generation}{p.branch&&p.branch!=='Chưa phân chi'?' · '+p.branch:''}</span></div></button>
              {p.birth_date&&<p className="living-meta"><Cake/>{solarLabel(p.birth_date)}{bd?` · còn ${bd.daysAway} ngày nữa tròn ${bd.turning} tuổi`:''}</p>}
              {p.phone
                ? <div className="living-contact"><a className="living-phone" href={`tel:${p.phone.replace(/\s/g,'')}`}><Phone/>{p.phone}</a><a className="living-zalo" href={`https://zalo.me/${p.phone.replace(/\D/g,'')}`} target="_blank" rel="noreferrer">Zalo</a></div>
                : <p className="living-meta muted"><Phone/>Chưa có số liên hệ</p>}
            </article>;})}</div>}
        <p className="calendar-footnote">Danh bạ này không hiện với khách chưa đăng nhập, và cũng không nằm trong bản dữ liệu công khai.</p></>}
      {section==='members'&&!guest&&<Members data={data} reload={reload} notify={setToast}/>}
      {section==='account'&&!guest&&<Account key={accountTab} data={data} reload={reload} notify={setToast} initialTab={accountTab}/>}
      {section==='person'&&(activePerson
        ? <PersonPage key={activePerson.id} person={activePerson} events={events.filter(e=>e.id===activePerson.id)} data={data} admin={admin} guest={guest} today={today} go={go}
            reload={reload} notify={setToast} onRemind={guest?undefined:openReminder}
            onEdit={()=>{setActionError('');setModal({type:'edit',person:activePerson});}}
            onDeleteRequest={()=>{setActionError('');setModal({type:'delete',person:activePerson});}}/>
        : <PersonMissing go={go}/>)}
      {(!['overview','calendar','family','living','memories','members','account','person'].includes(section)||(guest&&(section==='account'||section==='members'||section==='living')))&&<Empty title="Trang này chưa có trong Đỗ Gia." description="Bạn có thể quay lại lịch gia đình." action={<Button onClick={()=>go('overview')}>Về tổng quan</Button>}/>}
      <footer className="app-footer"><span>{data.family.name}</span><span>Lưu giữ hôm qua. Gắn kết hôm nay.</span></footer>
    </main></div>{toast&&<div className="toast" role="status"><Check/>{toast}<button onClick={()=>setToast('')} aria-label="Đóng thông báo"><X/></button></div>}
      {modal?.type==='edit'&&<AncestorForm ancestor={modal.person} ancestors={data.ancestors} onClose={()=>setModal(null)} onSaved={async()=>{await reload();setToast('Đã lưu ngày giỗ của người thân.');}}/>}
      {modal?.type==='reminder'&&<Modal title="Để không lỡ một ngày nhớ." eyebrow="Lời nhắc dành riêng cho bạn" onClose={()=>setModal(null)}><p className="modal-copy"><strong>{modal.person.name}</strong><br/>Ngày {pad(modal.person.lunar_day)}/{pad(modal.person.lunar_month)} âm lịch</p><div className="reminder-summary"><Mail/><div><strong>{data.preferences.enabled?'Nhận nhắc qua email':'Lời nhắc đang tắt'}</strong><p>{data.user.email}</p></div></div><div className="reminder-summary"><Smartphone/><div><strong>{data.preferences.enabled?'Và báo thức trên lịch điện thoại':'Lịch điện thoại sẽ không đổ chuông'}</strong><p>{data.preferences.enabled?'Nếu bạn đã đăng ký lịch Đỗ Gia trên máy.':'Bật nhắc để lịch tự báo.'}</p></div></div><div className="reminder-summary"><Bell/><div><strong>{data.preferences.all_events?'Đang áp dụng cho tất cả người thân':'Chỉ áp dụng với người bạn theo dõi'}</strong><p>{data.preferences.days.map(d=>d===0?'Đúng ngày':`Trước ${d} ngày`).join(' · ')} · {pad(data.preferences.hour)}:{pad(data.preferences.minute)}</p></div></div>{actionError&&<p className="form-error" role="alert">{actionError}</p>}<footer className="modal-actions wrap"><Button onClick={()=>openSettings()}>Cài đặt thời gian nhắc</Button>{!data.preferences.all_events&&<Button variant="primary" disabled={busy} onClick={saveSubscription}>{data.subscriptions.includes(modal.person.id)?<Check/>:<Plus/>}{busy?'Đang lưu…':data.subscriptions.includes(modal.person.id)?'Ngừng theo dõi ngày này':'Theo dõi ngày giỗ này'}</Button>}</footer>{data.demo&&<p className="hint">Bạn đang dùng dữ liệu mẫu. Đỗ Gia chưa gửi thông báo thật.</p>}</Modal>}
      {modal?.type==='delete'&&<Modal title="Xóa bản ghi ngày giỗ?" onClose={()=>setModal(null)}><p className="modal-copy"><strong>{modal.person.name}</strong> sẽ được chuyển vào thùng rác: ẩn khỏi gia phả, lịch và lời nhắc, nhưng chưa mất. Người quản lý khôi phục lại được trong <em>Tài khoản → Dữ liệu & thùng rác</em>.</p>{actionError&&<p className="form-error" role="alert">{actionError}</p>}<footer className="modal-actions"><Button onClick={()=>setModal(null)}>Giữ lại</Button><Button variant="danger-fill" disabled={busy} onClick={deletePerson}><Trash2/>{busy?'Đang xóa…':'Chuyển vào thùng rác'}</Button></footer></Modal>}
  </div>;
}

/** Máy chủ Đỗ Gia ngủ khi lâu không ai vào, và cơ sở dữ liệu cũng vậy; người mở đầu
 * tiên trong ngày phải chờ vài giây cho cả hai tỉnh dậy. Màn hình chờ vì thế nói thật
 * đang chờ cái gì, và sau mười hai giây thì đưa ra nút bấm, chứ không để người ta ngồi
 * nhìn một dòng chữ không đổi rồi tưởng máy hỏng. */
function Waking(){
  const [waited,setWaited]=useState(0);
  useEffect(()=>{
    const marks=[setTimeout(()=>setWaited(1),3500),setTimeout(()=>setWaited(2),12000)];
    return()=>marks.forEach(clearTimeout);
  },[]);
  return <div className="app-loading"><Brand/>
    <span>{waited?'Đang đánh thức máy chủ…':'Đang mở nếp nhà…'}</span>
    {waited===2&&<><p className="waking-note">Lần đầu trong ngày thường lâu hơn một chút. Nếu vẫn chưa vào được, thử tải lại trang.</p><Button onClick={()=>location.reload()}><RefreshCw/>Tải lại</Button></>}
  </div>;
}
