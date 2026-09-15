import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server/app.js';
import { openDatabase } from '../server/db.js';
import { testDatabase } from './database.js';
import { getConfig } from '../server/config.js';
import { alarmTrigger } from '../server/calendar.js';
import { occurrences, todayInVietnam, addDays, observanceEvents } from '../shared/lunar.js';

// A real 1x1 JPEG: the upload route trusts magic bytes, not the data-URL label.
const JPEG = '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==';
const photoBody = { data: 'data:image/jpeg;base64,' + JPEG };

// Blob storage is proven separately (write, read back, delete, 404). On the disk driver
// the test can also prove no orphan file is left behind, so assert that only there.
const onDisk = !process.env.BLOB_READ_WRITE_TOKEN;
const assertFiles = (f,n,msg) => { if (onDisk) assert.equal(readdirSync(join(f.dir,'uploads')).length,n,msg); };

async function fixture(t, overrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'coi-feature-'));
  const outbox = [];
  const config = getConfig({production:false,dbPath:join(dir,'db.sqlite'),uploadDir:join(dir,'uploads'),secret:'test-secret-that-is-at-least-32-characters',demo:true,remindersEnabled:false,adminEmail:'admin@example.test',appUrl:'http://localhost:5173',...overrides});
  const { target, schema } = testDatabase(config.dbPath);
  const db = await openDatabase(target, { schema });
  const context = await createApp(config, {db, mailer:{send:async m=>{outbox.push(m);return {preview:true};}}});
  const server = await new Promise(resolve=>{const s=context.app.listen(0,'127.0.0.1',()=>resolve(s));});
  t.after(async()=>{await new Promise(r=>server.close(r));await db.dropSchema?.();await db.close();rmSync(dir,{recursive:true,force:true});});
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(path,{method='GET',body,cookie,headers={}}={}) {
    const response = await fetch(base+'/api'+path,{method,headers:{'Content-Type':'application/json','X-Coi-Request':'1',...(cookie?{Cookie:cookie}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});
    const type = response.headers.get('content-type')||'';
    const binary = type.startsWith('image/') && !type.includes('svg');
    const data = type.includes('json')?await response.json():binary?Buffer.from(await response.arrayBuffer()):await response.text();
    return {status:response.status,data,type,cookie:response.headers.get('set-cookie')?.split(';')[0],headers:response.headers};
  }
  const loginDemo = async(role='admin')=>(await request('/auth/demo',{method:'POST',body:{role}})).cookie;
  return {...context,config,dir,schema,target,outbox,request,loginDemo};
}

test('Feed lịch: token mở được không cần đăng nhập, trải nhiều năm, đổi token thì link cũ chết', async t => {
  const f = await fixture(t), admin = await f.loginDemo();
  const boot = (await f.request('/bootstrap',{cookie:admin})).data;
  assert.match(boot.calendar.url,/^http:\/\/localhost:5173\/api\/calendar\/[a-f0-9]{64}\/lich-ngay-gio\.ics$/);
  assert.ok(boot.calendar.webcal.startsWith('webcal://'),'phải có link webcal cho điện thoại');

  const path = new URL(boot.calendar.url).pathname.replace('/api','');
  const feed = await f.request(path);
  assert.equal(feed.status,200);
  assert.ok(feed.type.includes('text/calendar'));
  assert.ok(feed.data.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.match(feed.data,/X-WR-CALNAME:Ngày giỗ · Dòng họ Nguyễn/);
  assert.match(feed.data,/REFRESH-INTERVAL;VALUE=DURATION:PT12H/);

  // Five demo ancestors over five years, so the phone never runs out of dates.
  const starts = [...feed.data.matchAll(/DTSTART;VALUE=DATE:(\d{8})/g)].map(m=>m[1]).sort();
  assert.ok(starts.length>=25,`feed phải có nhiều năm sự kiện, đang có ${starts.length}`);
  const spanYears = (Number(starts.at(-1).slice(0,4))-Number(starts[0].slice(0,4)));
  assert.ok(spanYears>=4,`feed phải trải ít nhất 4 năm, đang trải ${spanYears}`);

  assert.equal((await f.request('/calendar/'+'0'.repeat(64)+'/lich-ngay-gio.ics')).status,404);
  assert.equal((await f.request('/calendar/khong-phai-token/lich-ngay-gio.ics')).status,404);

  const rotated = await f.request('/calendar-token',{method:'POST',cookie:admin});
  assert.equal(rotated.status,200);
  assert.notEqual(rotated.data.url,boot.calendar.url);
  assert.equal((await f.request(path)).status,404,'link cũ phải hết hiệu lực sau khi tạo link mới');
  assert.equal((await f.request(new URL(rotated.data.url).pathname.replace('/api',''))).status,200);
});

test('Feed mang báo thức đúng theo cài đặt nhắc của từng người', async t => {
  const f = await fixture(t), admin = await f.loginDemo();
  const path = new URL((await f.request('/bootstrap',{cookie:admin})).data.calendar.url).pathname.replace('/api','');

  await f.request('/preferences',{method:'PATCH',cookie:admin,body:{enabled:false,days:[7],hour:7,minute:0,all_events:true}});
  assert.equal([...(await f.request(path)).data.matchAll(/BEGIN:VALARM/g)].length,0,'tắt nhắc thì feed không kèm báo thức');

  await f.request('/preferences',{method:'PATCH',cookie:admin,body:{enabled:true,days:[30,3,0],hour:6,minute:30,all_events:true}});
  const feed = (await f.request(path)).data;
  const triggers = [...feed.matchAll(/TRIGGER;RELATED=START:(\S+)/g)].map(m=>m[1]);
  assert.ok(triggers.includes('-P29DT17H30M'),'thiếu báo thức trước 30 ngày lúc 6:30');
  assert.ok(triggers.includes('-P2DT17H30M'),'thiếu báo thức trước 3 ngày');
  assert.ok(triggers.includes('PT6H30M'),'thiếu báo thức đúng ngày');
  assert.match(feed,/DESCRIPTION:Còn 30 ngày: Ngày giỗ/);
});

test('Mốc nhắc mở rộng ngoài 7-3-0 và loại bỏ mốc lạ', async t => {
  const f = await fixture(t), admin = await f.loginDemo();
  assert.equal((await f.request('/preferences',{method:'PATCH',cookie:admin,body:{enabled:true,days:[30,14,1],hour:8,minute:0,all_events:true}})).status,200);
  assert.deepEqual((await f.request('/bootstrap',{cookie:admin})).data.preferences.days,[30,14,1]);
  assert.equal((await f.request('/preferences',{method:'PATCH',cookie:admin,body:{enabled:true,days:[5],hour:8,minute:0,all_events:true}})).status,400);
  assert.equal((await f.request('/preferences',{method:'PATCH',cookie:admin,body:{enabled:true,days:[],hour:8,minute:0,all_events:true}})).status,400);
});

test('Ngày lệ của dòng họ vào lịch và tắt được', async t => {
  const f = await fixture(t), admin = await f.loginDemo();
  const path = new URL((await f.request('/bootstrap',{cookie:admin})).data.calendar.url).pathname.replace('/api','');
  assert.match((await f.request(path)).data,/SUMMARY:Tết Nguyên đán · mùng 1/);
  assert.match((await f.request(path)).data,/CATEGORIES:Việc họ/);

  assert.equal((await f.request('/family',{method:'PATCH',cookie:admin,body:{name:'Dòng họ Nguyễn',home:'',observances:[]}})).status,200);
  assert.doesNotMatch((await f.request(path)).data,/CATEGORIES:Việc họ/);
  assert.equal((await f.request('/family',{method:'PATCH',cookie:admin,body:{name:'Dòng họ Nguyễn',home:'',observances:['khong-co-ngay-nay']}})).status,400);

  const tet = observanceEvents(['tet'],'2026-01-01','2026-12-31');
  assert.equal(tet.length,1);
  assert.equal(tet[0].date,'2026-02-17');
});

test('Album ảnh: thêm nhiều ảnh, chọn ảnh đại diện, xóa thì tự chuyển đại diện', async t => {
  const f = await fixture(t), admin = await f.loginDemo(), member = await f.loginDemo('member');
  const people = (await f.request('/bootstrap',{cookie:admin})).data.ancestors;
  const person = people[0], other = people[1];

  assert.equal((await f.request(`/ancestors/${person.id}/photos`,{method:'POST',cookie:member,body:photoBody})).status,403);
  const first = await f.request(`/ancestors/${person.id}/photos`,{method:'POST',cookie:admin,body:{...photoBody,caption:'Cụ chụp năm 1990'}});
  assert.equal(first.status,201);
  assert.equal(first.data.portrait,true,'ảnh đầu tiên tự thành ảnh đại diện');

  const fetched = await f.request('/photos/'+first.data.id,{cookie:member});
  assert.equal(fetched.status,200);
  assert.equal(fetched.type,'image/jpeg');
  assert.ok(fetched.data.length>0);

  const second = await f.request(`/ancestors/${person.id}/photos`,{method:'POST',cookie:admin,body:photoBody});
  assert.equal(second.data.portrait,false,'ảnh thứ hai không chiếm chỗ ảnh đại diện');
  assertFiles(f,2,'album giữ lại cả hai ảnh');

  let boot = (await f.request('/bootstrap',{cookie:member})).data;
  assert.equal(boot.photos.filter(p=>p.ancestor_id===person.id).length,2);
  assert.equal(boot.photos.find(p=>p.id===first.data.id).caption,'Cụ chụp năm 1990');
  assert.equal(boot.ancestors.find(a=>a.id===person.id).photo_id,first.data.id);

  assert.equal((await f.request(`/ancestors/${other.id}/portrait`,{method:'PUT',cookie:admin,body:{photo_id:first.data.id}})).status,404,'không lấy được ảnh của người khác làm đại diện');
  assert.equal((await f.request(`/ancestors/${person.id}/portrait`,{method:'PUT',cookie:admin,body:{photo_id:second.data.id}})).status,200);
  boot = (await f.request('/bootstrap',{cookie:admin})).data;
  assert.equal(boot.ancestors.find(a=>a.id===person.id).photo_id,second.data.id);
  assert.ok(boot.ancestors.find(a=>a.id===person.id).revision>1,'đổi ảnh phải tăng revision để lịch đã đăng ký cập nhật');

  assert.equal((await f.request('/photos/'+second.data.id,{method:'PATCH',cookie:member,body:{caption:'x'}})).status,403);
  assert.equal((await f.request('/photos/'+second.data.id,{method:'DELETE',cookie:admin})).status,200);
  boot = (await f.request('/bootstrap',{cookie:admin})).data;
  assert.equal(boot.ancestors.find(a=>a.id===person.id).photo_id,first.data.id,'xóa ảnh đại diện thì ảnh còn lại lên thay');
  assertFiles(f,1);

  assert.equal((await f.request(`/ancestors/${person.id}/photos`,{method:'POST',cookie:admin,body:{data:'data:image/jpeg;base64,'+Buffer.from('<svg onload=alert(1)>').toString('base64')}})).status,400,'tệp không phải ảnh phải bị từ chối');
  assert.equal((await f.request('/photos/'+first.data.id,{method:'DELETE',cookie:admin})).status,200);
  boot = (await f.request('/bootstrap',{cookie:admin})).data;
  assert.equal(boot.ancestors.find(a=>a.id===person.id).photo_id,null);
  assertFiles(f,0);
});

test('Ảnh của dòng họ khác không xem được', async t => {
  const f = await fixture(t), demo = await f.loginDemo();
  const person = (await f.request('/bootstrap',{cookie:demo})).data.ancestors[0];
  const photo = await f.request(`/ancestors/${person.id}/photos`,{method:'POST',cookie:demo,body:photoBody});

  const challenge = await f.request('/auth/request-code',{method:'POST',body:{email:'admin@example.test'}});
  const code = f.outbox.at(-1).text.match(/\b\d{6}\b/)[0];
  const other = (await f.request('/auth/verify',{method:'POST',body:{challengeId:challenge.data.challengeId,code}})).cookie;
  assert.equal((await f.request('/photos/'+photo.data.id,{cookie:other})).status,404);
});

test('Ký ức của thành viên chờ duyệt; quản lý duyệt hoặc từ chối', async t => {
  const f = await fixture(t), admin = await f.loginDemo(), member = await f.loginDemo('member');
  const person = (await f.request('/bootstrap',{cookie:member})).data.ancestors[0];

  const sent = await f.request(`/ancestors/${person.id}/memories`,{method:'POST',cookie:member,body:{body:'Cháu vẫn nhớ những buổi chiều cụ ngồi kể chuyện ở hiên nhà.'}});
  assert.equal(sent.status,201);
  assert.equal(sent.data.status,'pending');
  assert.equal((await f.request(`/ancestors/${person.id}/memories`,{method:'POST',cookie:member,body:{body:'Quá ngắn'}})).status,400);

  const adminSees = (await f.request('/bootstrap',{cookie:admin})).data.memories;
  assert.equal(adminSees.length,1);
  assert.equal(adminSees[0].status,'pending');
  assert.equal(adminSees[0].author_name,'Nguyễn Thu An');

  assert.equal((await f.request('/memories/'+sent.data.id,{method:'PATCH',cookie:member,body:{status:'approved'}})).status,403);
  assert.equal((await f.request('/memories/'+sent.data.id,{method:'PATCH',cookie:admin,body:{status:'approved'}})).status,200);
  assert.equal((await f.request('/bootstrap',{cookie:member})).data.memories[0].status,'approved');

  const byAdmin = await f.request(`/ancestors/${person.id}/memories`,{method:'POST',cookie:admin,body:{body:'Quản lý ghi lại một kỷ niệm chung của cả nhà.'}});
  assert.equal(byAdmin.data.status,'approved','ký ức do quản lý viết hiển thị ngay');
  assert.equal((await f.request('/memories/'+byAdmin.data.id,{method:'DELETE',cookie:member})).status,403);
  assert.equal((await f.request('/memories/'+sent.data.id,{method:'DELETE',cookie:member})).status,200,'người gửi xóa được ký ức của mình');
});

test('Điểm danh ngày giỗ chỉ nhận đúng ngày giỗ sắp tới', async t => {
  const f = await fixture(t), admin = await f.loginDemo(), member = await f.loginDemo('member');
  const data = (await f.request('/bootstrap',{cookie:member})).data;
  const event = occurrences(data.ancestors,data.today,addDays(data.today,400))[0];

  assert.equal((await f.request('/attendance/'+event.id,{method:'PUT',cookie:member,body:{status:'yes',note:'Cháu về từ chiều hôm trước.',event_date:event.date}})).status,200);
  assert.equal((await f.request('/attendance/'+event.id,{method:'PUT',cookie:member,body:{status:'maybe',note:'',event_date:addDays(event.date,1)}})).status,400,'ngày không phải ngày giỗ phải bị từ chối');
  assert.equal((await f.request('/attendance/'+event.id,{method:'PUT',cookie:member,body:{status:'no',note:'',event_date:addDays(todayInVietnam(),-3)}})).status,400,'ngày đã qua phải bị từ chối');

  const seen = (await f.request('/bootstrap',{cookie:admin})).data.attendance;
  assert.equal(seen.length,1);
  assert.equal(seen[0].status,'yes');
  assert.equal(seen[0].user_name,'Nguyễn Thu An','cả nhà thấy ai về được');

  await f.request('/attendance/'+event.id,{method:'PUT',cookie:member,body:{status:'no',note:'Cháu bận công tác.',event_date:event.date}});
  const updated = (await f.request('/bootstrap',{cookie:admin})).data.attendance;
  assert.equal(updated.length,1,'đổi câu trả lời không tạo dòng mới');
  assert.equal(updated[0].status,'no');
});

test('Xóa người thân vào thùng rác, khôi phục được, xóa hẳn mới mất', async t => {
  const f = await fixture(t), admin = await f.loginDemo();
  const person = (await f.request('/bootstrap',{cookie:admin})).data.ancestors[0];
  await f.request(`/ancestors/${person.id}/photos`,{method:'POST',cookie:admin,body:photoBody});

  assert.equal((await f.request('/ancestors/'+person.id,{method:'DELETE',cookie:admin})).status,200);
  let boot = (await f.request('/bootstrap',{cookie:admin})).data;
  assert.ok(!boot.ancestors.some(a=>a.id===person.id),'người đã xóa không còn trong gia phả');
  assert.equal(boot.trash.length,1);
  assert.equal(boot.trash[0].name,person.name);

  const path = new URL(boot.calendar.url).pathname.replace('/api','');
  assert.doesNotMatch((await f.request(path)).data,new RegExp('Ngày giỗ '+person.name),'lịch không còn nhắc người đã xóa');

  assert.equal((await f.request(`/ancestors/${person.id}/restore`,{method:'POST',cookie:admin})).status,200);
  boot = (await f.request('/bootstrap',{cookie:admin})).data;
  assert.ok(boot.ancestors.some(a=>a.id===person.id),'khôi phục lại đủ thông tin');
  assert.equal(boot.trash.length,0);
  assert.match((await f.request(path)).data,new RegExp('Ngày giỗ '+person.name));

  await f.request('/ancestors/'+person.id,{method:'DELETE',cookie:admin});
  assert.equal((await f.request('/trash/'+person.id,{method:'DELETE',cookie:admin})).status,200);
  assertFiles(f,0,'xóa hẳn thì dọn cả ảnh');
  assert.equal((await f.request(`/ancestors/${person.id}/restore`,{method:'POST',cookie:admin})).status,404);
});

test('Số điện thoại chỉ hiện khi chủ nhân đồng ý chia sẻ', async t => {
  const f = await fixture(t), admin = await f.loginDemo(), member = await f.loginDemo('member');
  await f.request('/profile',{method:'PATCH',cookie:member,body:{name:'Nguyễn Thu An',phone:'0900000000',share_phone:false}});
  const hidden = (await f.request('/bootstrap',{cookie:admin})).data.members.find(m=>m.name==='Nguyễn Thu An');
  assert.equal(hidden.phone,'','chưa đồng ý thì người khác không thấy số');
  assert.equal((await f.request('/bootstrap',{cookie:member})).data.user.phone,'0900000000','chủ nhân vẫn thấy số của mình');

  await f.request('/profile',{method:'PATCH',cookie:member,body:{name:'Nguyễn Thu An',phone:'0900000000',share_phone:true}});
  assert.equal((await f.request('/bootstrap',{cookie:admin})).data.members.find(m=>m.name==='Nguyễn Thu An').phone,'0900000000');
});

test('Quản lý xuất được toàn bộ dữ liệu dòng họ, thành viên thì không', async t => {
  const f = await fixture(t), admin = await f.loginDemo(), member = await f.loginDemo('member');
  assert.equal((await f.request('/export.json',{cookie:member})).status,403);
  const exported = await f.request('/export.json',{cookie:admin});
  assert.equal(exported.status,200);
  assert.match(exported.headers.get('content-disposition'),/coi-du-lieu-dong-ho\.json/);
  const data = exported.data;
  assert.equal(data.ancestors.length,5);
  assert.equal(data.members.length,2);
  assert.ok(data.family.observances.includes('tet'));
});

test('Mã QR dựng từ link webcal của chính người đang đăng nhập', async t => {
  const f = await fixture(t), admin = await f.loginDemo();
  const qr = await f.request('/calendar-qr.svg',{cookie:admin});
  assert.equal(qr.status,200);
  assert.ok(qr.type.includes('image/svg+xml'));
  assert.ok(qr.data.startsWith('<svg'));
  assert.equal((await f.request('/calendar-qr.svg')).status,401);
});

test('Vợ chồng nối hai chiều, đổi bạn đời thì giải phóng liên kết cũ', async t => {
  const f = await fixture(t), admin = await f.loginDemo(), member = await f.loginDemo('member');
  const people = (await f.request('/bootstrap',{cookie:admin})).data.ancestors;
  const [ong,ba,khac] = people;
  const edit = (target,changes) => f.request('/ancestors/'+target.id,{method:'PUT',cookie:admin,
    body:{name:target.name,generation:target.generation,branch:target.branch,birth_year:target.birth_year,death_year:target.death_year,
      parent_id:target.parent_id,spouse_id:null,lunar_day:target.lunar_day,lunar_month:target.lunar_month,leap_policy:target.leap_policy,
      short_month_policy:target.short_month_policy,location:target.location,biography:target.biography,note:target.note,
      living:!!target.living,birth_date:target.birth_date||'',phone:target.phone||'',...changes}});
  const spouseOf = async id => (await f.request('/bootstrap',{cookie:admin})).data.ancestors.find(a=>a.id===id).spouse_id;

  assert.equal((await edit(ong,{spouse_id:ong.id})).status,400,'không thể là vợ/chồng của chính mình');
  assert.equal((await f.request('/ancestors/'+ong.id,{method:'PUT',cookie:member,body:{...ong,spouse_id:ba.id}})).status,403);

  assert.equal((await edit(ong,{spouse_id:ba.id})).status,200);
  assert.equal(await spouseOf(ong.id),ba.id);
  assert.equal(await spouseOf(ba.id),ong.id,'liên kết phải được ghi ngược lại cho người kia');

  // Nối ông với người khác: bà phải được giải phóng, không còn treo liên kết cũ.
  assert.equal((await edit(ong,{spouse_id:khac.id})).status,200);
  assert.equal(await spouseOf(ong.id),khac.id);
  assert.equal(await spouseOf(khac.id),ong.id);
  assert.equal(await spouseOf(ba.id),null,'bạn đời cũ phải được gỡ liên kết');

  assert.equal((await edit(ong,{spouse_id:null})).status,200);
  assert.equal(await spouseOf(ong.id),null);
  assert.equal(await spouseOf(khac.id),null,'gỡ một chiều thì chiều kia cũng gỡ');

  // A second family inside the same app: opening a second pool would not isolate on
  // Neon's pooled endpoint, where SET search_path does not survive connection reuse.
  const challenge = await f.request('/auth/request-code',{method:'POST',body:{email:'admin@example.test'}});
  const code = f.outbox.at(-1).text.match(/\b\d{6}\b/)[0];
  const outsider = (await f.request('/auth/verify',{method:'POST',body:{challengeId:challenge.data.challengeId,code}})).cookie;
  const stranger = await f.request('/ancestors',{method:'POST',cookie:outsider,body:{
    name:'Cụ Nhà Khác',generation:1,branch:'Chi khác',birth_year:null,death_year:null,parent_id:null,spouse_id:null,
    lunar_day:5,lunar_month:5,leap_policy:'regular',short_month_policy:'last-day',location:'',biography:'',note:'',living:false,birth_date:'',phone:''}});
  assert.equal(stranger.status,201);
  assert.equal((await edit(ong,{spouse_id:stranger.data.id})).status,404,'không nối được với người ngoài dòng họ');
});

test('Điểm chạy nhắc lịch định kỳ chỉ mở cho lời gọi có chữ ký đúng', async t => {
  const closed = await fixture(t);
  assert.equal((await closed.request('/cron/reminders')).status,401,'không khai CRON_SECRET thì endpoint phải đóng');

  const f = await fixture(t,{cronSecret:'bi-mat-cron-dai-va-ngau-nhien',remindersEnabled:true});
  assert.equal((await f.request('/cron/reminders')).status,401,'thiếu chữ ký phải bị từ chối');
  assert.equal((await f.request('/cron/reminders',{headers:{Authorization:'Bearer sai-be-bet'}})).status,401);
  const ok = await f.request('/cron/reminders',{headers:{Authorization:'Bearer bi-mat-cron-dai-va-ngau-nhien'}});
  assert.equal(ok.status,200);
  assert.deepEqual(Object.keys(ok.data).sort(),['failed','sent']);
});

test('Khách xem được phần tưởng nhớ, nhưng không thấy gì về người còn sống', async t => {
  const f = await fixture(t,{adminPassword:'mat-khau-quan-ly-du-dai'});
  const admin = await f.loginDemo(), member = await f.loginDemo('member');
  const person = (await f.request('/bootstrap',{cookie:admin})).data.ancestors[0];
  const photo = await f.request(`/ancestors/${person.id}/photos`,{method:'POST',cookie:admin,body:photoBody});
  await f.request(`/ancestors/${person.id}/memories`,{method:'POST',cookie:admin,body:{body:'Ký ức đã được duyệt cho cả nhà đọc.'}});
  await f.request(`/ancestors/${person.id}/memories`,{method:'POST',cookie:member,body:{body:'Ký ức này còn đang chờ người quản lý duyệt.'}});

  const guest = await f.request('/public');
  assert.equal(guest.status,200);
  assert.ok(guest.data.ancestors.length>0,'khách phải xem được gia phả');
  assert.equal(guest.data.photos.length,1);
  assert.equal(guest.data.memories.length,1,'chỉ ký ức đã duyệt mới lộ ra');

  // Không một mẩu thông tin nào về người còn sống được lọt vào bản công khai.
  const dump = JSON.stringify(guest.data);
  for (const leak of ['minhha@example.test','thuan@example.test','@example','members','attendance','invitations','calendar','preferences','author_id'])
    assert.ok(!dump.includes(leak),`bản công khai không được chứa "${leak}"`);

  // Danh sách cột được phép ra ngoài, chứ không phải "lấy hết rồi bỏ bớt": một cột
  // thêm vào ancestors sau này phải được khai báo ở đây mới công khai, nếu không thì
  // ở lại bên trong. phone và birth_date là của người sống, không bao giờ ra tới đây.
  const allowed = new Set(['id','name','generation','branch','birth_year','death_year','parent_id','spouse_id',
    'lunar_day','lunar_month','leap_policy','short_month_policy','location','biography','note','photo_id','revision','updated_at','living']);
  for (const person of guest.data.ancestors) {
    assert.ok(!person.living,'người còn sống không được lọt vào bản công khai');
    const extra = Object.keys(person).filter(key => !allowed.has(key));
    assert.deepEqual(extra,[],`bản công khai lộ thêm cột: ${extra.join(', ')}`);
  }

  assert.equal((await f.request('/bootstrap')).status,401,'khách vẫn không vào được dữ liệu thành viên');
  assert.equal((await f.request('/photos/'+photo.data.id)).status,200,'ảnh xem được khi đã mở công khai');

  const kin = await fixture(t,{publicView:false});
  const keeper = await kin.loginDemo();
  const kept = await kin.request(`/ancestors/${(await kin.request('/bootstrap',{cookie:keeper})).data.ancestors[0].id}/photos`,{method:'POST',cookie:keeper,body:photoBody});
  assert.equal((await kin.request('/public')).status,404,'tắt công khai thì endpoint đóng');
  assert.equal((await kin.request('/photos/'+kept.data.id)).status,401,'tắt công khai thì ảnh cũng phải đăng nhập');
});

test('Quản lý đăng nhập bằng email và mật khẩu, không cần tới hộp thư', async t => {
  const f = await fixture(t,{adminPassword:'phong2001',adminEmail:'quanly@example.test'});
  const login = body => f.request('/auth/password',{method:'POST',body});

  assert.equal((await login({email:'quanly@example.test',password:'sai-be-bet'})).status,401);
  assert.equal((await login({email:'nguoi-la@example.test',password:'phong2001'})).status,401);
  // Sai email và sai mật khẩu phải trả cùng một thông điệp, để không lộ email nào là đúng.
  const saiEmail = await login({email:'nguoi-la@example.test',password:'phong2001'});
  const saiPass = await login({email:'quanly@example.test',password:'sai-be-bet'});
  assert.equal(saiEmail.data.error,saiPass.data.error);

  const ok = await login({email:'quanly@example.test',password:'phong2001'});
  assert.equal(ok.status,200);
  assert.equal(ok.data.user.role,'admin');
  assert.equal(ok.data.user.email,'quanly@example.test');

  // Lần đăng nhập đầu tiên dựng luôn dòng họ, nên không cần SMTP để khởi tạo.
  const boot = await f.request('/bootstrap',{cookie:ok.cookie});
  assert.equal(boot.status,200);
  assert.equal(boot.data.family.name,'Dòng họ Đỗ');
  assert.notEqual(boot.data.user.family_id,'demo-family');

  const again = await login({email:'quanly@example.test',password:'phong2001'});
  assert.equal((await f.request('/bootstrap',{cookie:again.cookie})).data.family.id,boot.data.family.id,'không được tạo thêm dòng họ mới mỗi lần đăng nhập');

  const off = await fixture(t);
  assert.equal((await off.request('/auth/password',{method:'POST',body:{email:'admin@example.test',password:'bat-ky-thu-gi'}})).status,401,'không khai ADMIN_PASSWORD thì đường này đóng');
});

test('Nhật ký ghi lại tài khoản mới, lần đăng nhập và lần trượt', async t => {
  const f = await fixture(t,{adminPassword:'phong2001',adminEmail:'quanly@example.test'});
  const login = body => f.request('/auth/password',{method:'POST',body});

  await login({email:'quanly@example.test',password:'sai-be-bet'});
  const admin = (await login({email:'quanly@example.test',password:'phong2001'})).cookie;
  const invited = await f.request('/invitations',{method:'POST',cookie:admin,body:{name:'Người Được Mời',email:'nguoi-moi@example.test',role:'member'}});
  const token = new URL(invited.data.url).searchParams.get('invite');
  const challenge = await f.request('/auth/request-code',{method:'POST',body:{email:'nguoi-moi@example.test',inviteToken:token}});
  const code = f.outbox.at(-1).text.match(/\b\d{6}\b/)[0];
  await f.request('/auth/verify',{method:'POST',body:{challengeId:challenge.data.challengeId,code}});

  const log = (await f.request('/bootstrap',{cookie:admin})).data.auditLog;
  const kinds = log.map(r=>r.action);
  assert.ok(kinds.includes('dang-nhap-that-bai'),'phải ghi lần đăng nhập trượt');
  assert.ok(kinds.includes('dang-nhap'),'phải ghi lần đăng nhập thành công');
  assert.ok(kinds.includes('moi-thanh-vien'),'phải ghi lần mời thành viên');
  assert.ok(kinds.includes('tai-khoan-moi'),'phải ghi tài khoản mới được tạo');

  const created = log.find(r=>r.action==='tai-khoan-moi');
  assert.equal(created.actor,'nguoi-moi@example.test');
  assert.match(created.detail,/quyền member/);
  assert.ok(new Date(created.created_at+'Z').getTime()>Date.now()-120000,'mốc thời gian phải là hiện tại');

  // Nhật ký chỉ dành cho quản lý, và không bao giờ chứa IP thật hay mật khẩu.
  const member = await f.loginDemo('member');
  assert.deepEqual((await f.request('/bootstrap',{cookie:member})).data.auditLog,[]);
  const dump = JSON.stringify(log);
  assert.ok(!dump.includes('phong2001'),'nhật ký không được chứa mật khẩu');
  assert.ok(!dump.includes('ip_hash')&&!dump.includes('127.0.0.1'),'không trả IP ra ngoài');
});

test('Tự đăng ký phải chờ duyệt mới vào được', async t => {
  const f = await fixture(t,{adminPassword:'phong2001',adminEmail:'quanly@example.test'});
  const admin = (await f.request('/auth/password',{method:'POST',body:{email:'quanly@example.test',password:'phong2001'}})).cookie;

  const reg = await f.request('/auth/register',{method:'POST',body:{name:'Đỗ Văn Cháu',email:'chau@example.test',password:'mat-khau-cua-chau'}});
  assert.equal(reg.status,201);
  assert.equal(reg.data.pending,true);
  assert.equal((await f.request('/auth/register',{method:'POST',body:{name:'Trùng',email:'chau@example.test',password:'mat-khau-khac'}})).status,409,'không cho đăng ký trùng email');
  assert.equal((await f.request('/auth/register',{method:'POST',body:{name:'Ngắn',email:'ngan@example.test',password:'1234'}})).status,400,'mật khẩu quá ngắn phải bị chặn');

  // Chưa duyệt thì đúng mật khẩu cũng không vào được — đây là chỗ giữ kín danh bạ.
  const blocked = await f.request('/auth/password',{method:'POST',body:{email:'chau@example.test',password:'mat-khau-cua-chau'}});
  assert.equal(blocked.status,403);
  assert.match(blocked.data.error,/chờ/);

  const waiting = (await f.request('/bootstrap',{cookie:admin})).data.pendingMembers;
  assert.equal(waiting.length,1);
  assert.equal(waiting[0].email,'chau@example.test');

  assert.equal((await f.request('/members/'+waiting[0].id+'/approve',{method:'POST',cookie:admin})).status,200);
  const ok = await f.request('/auth/password',{method:'POST',body:{email:'chau@example.test',password:'mat-khau-cua-chau'}});
  assert.equal(ok.status,200);
  assert.equal(ok.data.user.role,'member');
  assert.equal((await f.request('/bootstrap',{cookie:ok.cookie})).status,200);
  assert.equal((await f.request('/auth/password',{method:'POST',body:{email:'chau@example.test',password:'sai-be-bet'}})).status,401);

  const log = (await f.request('/bootstrap',{cookie:admin})).data.auditLog.map(r=>r.action);
  assert.ok(log.includes('dang-ky-moi')&&log.includes('duyet-tai-khoan'),'nhật ký phải ghi cả lúc đăng ký lẫn lúc duyệt');
});

test('Người còn sống: không có ngày giỗ, không lộ ra ngoài, có sinh nhật trên lịch', async t => {
  const f = await fixture(t), admin = await f.loginDemo();
  const alive = {name:'Đỗ Văn Minh',generation:5,branch:'Chi trưởng',birth_year:null,death_year:null,parent_id:null,spouse_id:null,
    lunar_day:1,lunar_month:1,leap_policy:'regular',short_month_policy:'last-day',location:'',biography:'',note:'',
    living:true,birth_date:'1990-03-15',phone:'0900111222'};
  assert.equal((await f.request('/ancestors',{method:'POST',cookie:admin,body:alive})).status,201);

  const boot = (await f.request('/bootstrap',{cookie:admin})).data;
  const saved = boot.ancestors.find(a=>a.name==='Đỗ Văn Minh');
  assert.ok(saved,'thành viên đã đăng nhập phải thấy người còn sống');
  assert.equal(saved.phone,'0900111222');

  // Khách không được thấy người còn sống, càng không thấy số điện thoại.
  const guest = (await f.request('/public')).data;
  assert.ok(!guest.ancestors.some(a=>a.name==='Đỗ Văn Minh'),'người còn sống không nằm trong bản công khai');
  assert.ok(!JSON.stringify(guest).includes('0900111222'),'số điện thoại không được lọt ra ngoài');

  // Không sinh ngày giỗ, nhưng có sinh nhật trong feed.
  assert.equal(occurrences([{...saved}],'2026-01-01','2026-12-31').length,0,'người còn sống không có ngày giỗ');
  const feed = (await f.request(new URL(boot.calendar.url).pathname.replace('/api',''))).data;
  assert.match(feed,/SUMMARY:Sinh nhật Đỗ Văn Minh/);
  assert.match(feed,/CATEGORIES:Sinh nhật/);
  assert.doesNotMatch(feed,/SUMMARY:Ngày giỗ Đỗ Văn Minh/);
});

test('Gửi mail qua Brevo: đúng địa chỉ API, đúng khóa, và lỗi thì báo ra', async () => {
  const { createMailer } = await import('../server/mail.js');
  const config = { mailDriver:'brevo', brevoKey:'khoa-brevo-gia-lap', brevoFrom:'nguoi-gui@example.test', brevoName:'Dòng họ Đỗ' };
  const mailer = createMailer(config);
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => { calls.push({url, options}); return { ok:true, status:201, text:async()=>'' }; };
  try {
    await mailer.send({to:'nguoi-nhan@example.test',subject:'Mã đăng nhập Cội',text:'Mã của bạn là 123456.'});
    assert.equal(calls.length,1);
    assert.equal(calls[0].url,'https://api.brevo.com/v3/smtp/email');
    assert.equal(calls[0].options.headers['api-key'],'khoa-brevo-gia-lap');
    const body = JSON.parse(calls[0].options.body);
    assert.equal(body.sender.email,'nguoi-gui@example.test');
    assert.equal(body.to[0].email,'nguoi-nhan@example.test');
    assert.equal(body.textContent,'Mã của bạn là 123456.');
    assert.ok(!('htmlContent' in body),'thư đăng nhập gửi dạng chữ thuần, không kèm HTML');

    // Brevo từ chối thì phải ném lỗi, để luồng OTP báo cho người dùng chứ không im lặng.
    globalThis.fetch = async () => ({ ok:false, status:401, text:async()=>'{"message":"Key not found"}' });
    await assert.rejects(() => mailer.send({to:'a@example.test',subject:'x',text:'y'}), /Brevo trả về 401/);
  } finally { globalThis.fetch = realFetch; }
});

test('Quy đổi báo thức sang chuỗi thời lượng iCalendar', () => {
  assert.equal(alarmTrigger(7,7,0),'-P6DT17H');
  assert.equal(alarmTrigger(0,7,0),'PT7H');
  assert.equal(alarmTrigger(0,0,0),'PT0M');
  assert.equal(alarmTrigger(1,0,0),'-P1D');
  assert.equal(alarmTrigger(1,0,30),'-PT23H30M');
  assert.equal(alarmTrigger(30,21,15),'-P29DT2H45M');
});
