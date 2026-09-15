import { getLunarDate, getYearInfo, getYearCanChi } from '@dqcai/vn-lunar';

const cache = new Map();
const leapCache = new Map();
export const pad = n => String(n).padStart(2,'0');
export function todayInVietnam(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const get = type => parts.find(p=>p.type===type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function vietnamClock(now = new Date()) {
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
  return Number(parts.find(x=>x.type==='hour').value)*60+Number(parts.find(x=>x.type==='minute').value);
}
export function civilDate(iso) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(iso))throw new Error('Ngày phải có dạng YYYY-MM-DD.');
  const date=new Date(iso+'T12:00:00Z');
  if(!Number.isFinite(+date)||date.toISOString().slice(0,10)!==iso)throw new Error('Ngày không hợp lệ.');
  return date;
}
export function addDays(iso,n) {const date=civilDate(iso);date.setUTCDate(date.getUTCDate()+n);return date.toISOString().slice(0,10);}
export function daysBetween(a,b) {return Math.round((civilDate(b)-civilDate(a))/86400000);}
export function lunarDate(iso) {
  if(cache.has(iso))return cache.get(iso);
  const date=civilDate(iso),year=date.getUTCFullYear();
  if(year<1900||year>2199)throw new Error('Cội hỗ trợ tra lịch từ năm 1900 đến 2199.');
  const lunar=getLunarDate(date.getUTCDate(),date.getUTCMonth()+1,year);
  const value={day:lunar.day,month:lunar.month,year:lunar.year,leap:!!lunar.leap};
  if(cache.size>4096)cache.clear();cache.set(iso,value);return value;
}
function leapMonth(year) {
  if(!leapCache.has(year))leapCache.set(year,getYearInfo(year).find(x=>x.leap)?.month||0);
  return leapCache.get(year);
}
export function lunarLabel(iso) {const l=lunarDate(iso);return `${pad(l.day)}/${pad(l.month)}${l.leap?' nhuận':''} âm lịch`;}
export function solarLabel(iso,options={}) {return new Intl.DateTimeFormat('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'UTC',...options}).format(civilDate(iso));}
export function lunarYearName(iso) {return getYearCanChi(lunarDate(iso).year);}

/** Dates are civil dates in Vietnam. A recurrence is resolved afresh each year.
 * regular: always the ordinary lunar month; prefer-leap: leap when available;
 * both: both months. Day 30 can use month end or be skipped, by family choice.
 */
export function occurrences(ancestors,from,to) {
  const length=daysBetween(from,to);
  if(length<0||length>800)throw new Error('Khoảng tra cứu phải nằm trong 800 ngày.');
  if(!ancestors.length)return [];
  const events=[];
  for(let i=0;i<=length;i++) {
    const date=addDays(from,i),lunar=lunarDate(date);
    for(const ancestor of ancestors) {
      if(ancestor.living)continue; // Người còn sống không có ngày giỗ.
      if(ancestor.lunar_month!==lunar.month)continue;
      if(ancestor.death_year&&lunar.year<ancestor.death_year)continue;
      const preferred=ancestor.leap_policy==='prefer-leap'&&leapMonth(lunar.year)===lunar.month;
      if(ancestor.leap_policy==='regular'&&lunar.leap)continue;
      if(ancestor.leap_policy==='prefer-leap'&&lunar.leap!==preferred)continue;
      let shifted=false;
      if(ancestor.lunar_day!==lunar.day) {
        if(ancestor.lunar_day===30&&lunar.day===29&&ancestor.short_month_policy==='last-day'&&lunarDate(addDays(date,1)).day===1)shifted=true;
        else continue;
      }
      events.push({...ancestor,date,lunar,shifted,key:`${ancestor.id}:${date}`,daysAway:daysBetween(from,date)});
    }
  }
  return events.sort((a,b)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name,'vi'));
}

export function monthGrid(year,month) {
  const first=`${year}-${pad(month)}-01`;
  const offset=(civilDate(first).getUTCDay()+6)%7;
  const start=addDays(first,-offset);
  const count=new Date(Date.UTC(year,month,0)).getUTCDate();
  const cells=Math.ceil((offset+count)/7)*7;
  return Array.from({length:cells},(_,i)=>{const date=addDays(start,i);return {date,lunar:lunarDate(date),outside:Number(date.slice(5,7))!==month};});
}

/** Standard observances of a Vietnamese family line. Leap months are skipped:
 * these days are kept in the ordinary month by custom. */
export const OBSERVANCES = [
  {key:'tat-nien',name:'Tất niên · ngày cuối năm',month:12,lastDay:true},
  {key:'tet',name:'Tết Nguyên đán · mùng 1',day:1,month:1},
  {key:'tet-mung-hai',name:'Tết · mùng 2',day:2,month:1},
  {key:'tet-hoa-vang',name:'Tết · mùng 3, hóa vàng',day:3,month:1},
  {key:'nguyen-tieu',name:'Rằm tháng Giêng · Nguyên tiêu',day:15,month:1},
  {key:'han-thuc',name:'Tết Hàn thực',day:3,month:3},
  {key:'gio-to',name:'Giỗ Tổ Hùng Vương',day:10,month:3},
  {key:'doan-ngo',name:'Tết Đoan ngọ',day:5,month:5},
  {key:'vu-lan',name:'Vu Lan · Rằm tháng Bảy',day:15,month:7},
  {key:'trung-thu',name:'Tết Trung thu',day:15,month:8},
  {key:'ong-tao',name:'Ông Công Ông Táo',day:23,month:12},
  {key:'mung-mot',name:'Mùng 1 hằng tháng',day:1,monthly:true},
  {key:'ram',name:'Rằm hằng tháng',day:15,monthly:true},
];
export const DEFAULT_OBSERVANCES = ['tat-nien','tet','nguyen-tieu','gio-to','vu-lan','trung-thu','ong-tao'];
export const observanceName = key => OBSERVANCES.find(o=>o.key===key)?.name || key;

export function observanceEvents(keys,from,to) {
  const wanted=OBSERVANCES.filter(o=>keys.includes(o.key));
  if(!wanted.length)return [];
  const length=daysBetween(from,to);
  if(length<0||length>800)throw new Error('Khoảng tra cứu phải nằm trong 800 ngày.');
  const events=[];
  for(let i=0;i<=length;i++) {
    const date=addDays(from,i),lunar=lunarDate(date);
    if(lunar.leap)continue;
    for(const o of wanted) {
      const hit=o.lastDay?lunar.month===o.month&&lunarDate(addDays(date,1)).day===1
        :o.monthly?lunar.day===o.day
        :lunar.day===o.day&&lunar.month===o.month;
      if(hit)events.push({...o,obsKey:o.key,id:'obs:'+o.key,observance:true,lunar_day:lunar.day,lunar_month:lunar.month,date,daysAway:daysBetween(from,date),key:`${o.key}:${date}`});
    }
  }
  return events.sort((a,b)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name,'vi'));
}

/** occurrences() caps a single lookup at 800 days; a calendar feed spans years. */
export function spanEvents(from,to,generator) {
  const events=[];let start=from;
  while(daysBetween(start,to)>=0) {
    const stop=daysBetween(start,to)>700?addDays(start,700):to;
    events.push(...generator(start,stop));
    start=addDays(stop,1);
  }
  return events;
}

/** Sinh nhật tính theo DƯƠNG lịch, khác ngày giỗ tính theo âm lịch. Ngày 29/02 chỉ
 * rơi vào năm nhuận, nên năm thường lùi về 28/02 để vẫn có một ngày mừng. */
export function birthdayEvents(people, from, to) {
  const length=daysBetween(from,to);
  if(length<0||length>800)throw new Error('Khoảng tra cứu phải nằm trong 800 ngày.');
  const wanted=people.filter(p=>p.living&&/^\d{4}-\d{2}-\d{2}$/.test(p.birth_date||''));
  if(!wanted.length)return [];
  const events=[];
  for(let i=0;i<=length;i++) {
    const date=addDays(from,i), month=date.slice(5,7), day=date.slice(8,10);
    const isLeapDay=month==='02'&&day==='28'&&!isLeapYear(Number(date.slice(0,4)));
    for(const person of wanted) {
      const bm=person.birth_date.slice(5,7), bd=person.birth_date.slice(8,10);
      const hit=(bm===month&&bd===day)||(isLeapDay&&bm==='02'&&bd==='29');
      if(!hit)continue;
      const turning=Number(date.slice(0,4))-Number(person.birth_date.slice(0,4));
      events.push({...person,date,birthday:true,turning,key:`bd:${person.id}:${date}`,daysAway:daysBetween(from,date)});
    }
  }
  return events.sort((a,b)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name,'vi'));
}
const isLeapYear = y => (y%4===0&&y%100!==0)||y%400===0;
