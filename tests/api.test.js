import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server/app.js';
import { getConfig } from '../server/config.js';
import { openDatabase } from '../server/db.js';
import { runReminders } from '../server/reminders.js';
import { lunarDate } from '../shared/lunar.js';

async function fixture(t,overrides={}) {
  const dir=mkdtempSync(join(tmpdir(),'coi-test-'));
  const outbox=[];
  const config=getConfig({production:false,dbPath:join(dir,'db.sqlite'),secret:'test-secret-that-is-at-least-32-characters',demo:true,remindersEnabled:false,adminEmail:'admin@example.test',appUrl:'http://localhost:5173',...overrides});
  const context=createApp(config,{mailer:{send:async mail=>{outbox.push(mail);return {preview:true};}}});
  const server=await new Promise(resolve=>{const s=context.app.listen(0,'127.0.0.1',()=>resolve(s));});
  t.after(async()=>{await new Promise(r=>server.close(r));context.db.close();rmSync(dir,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${server.address().port}`;
  async function request(path,{method='GET',body,cookie,headers={}}={}) {
    const response=await fetch(base+'/api'+path,{method,headers:{'Content-Type':'application/json','X-Coi-Request':'1',...(cookie?{Cookie:cookie}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});
    const type=response.headers.get('content-type')||'';
    const data=type.includes('json')?await response.json():await response.text();
    return {status:response.status,data,cookie:response.headers.get('set-cookie')?.split(';')[0],headers:response.headers};
  }
  const loginDemo=async(role='admin')=>(await request('/auth/demo',{method:'POST',body:{role}})).cookie;
  return {...context,config,outbox,request,loginDemo};
}
const person={name:'Cụ Nguyễn Test',generation:2,branch:'Chi thử',birth_year:1910,death_year:1980,parent_id:null,lunar_day:15,lunar_month:8,leap_policy:'regular',short_month_policy:'last-day',location:'Nhà thờ họ',biography:'Ký ức được lưu lại.',note:''};
test('Chặn người chưa đăng nhập, thành viên không được sửa; quản lý CRUD và dữ liệu tồn tại sau khi mở lại DB',async t=>{
  const f=await fixture(t);
  assert.equal((await f.request('/bootstrap')).status,401);
  const admin=await f.loginDemo(),member=await f.loginDemo('member');
  assert.equal((await f.request('/ancestors',{method:'POST',cookie:member,body:person})).status,403);
  const created=await f.request('/ancestors',{method:'POST',cookie:admin,body:person});assert.equal(created.status,201);
  const otherDb=openDatabase(f.config.dbPath);assert.equal(otherDb.prepare('SELECT name FROM ancestors WHERE id=?').get(created.data.id).name,person.name);otherDb.close();
  assert.equal((await f.request('/ancestors/'+created.data.id,{method:'PUT',cookie:admin,body:{...person,note:'Đã cập nhật'}})).status,200);
  assert.equal((await f.request('/ancestors',{method:'POST',cookie:admin,body:{...person,lunar_day:31}})).status,400);
  assert.equal((await f.request('/profile',{method:'PATCH',cookie:member,body:{name:'Thành viên',phone:'',role:'admin'}})).status,400);
  const wrongOrigin=await f.request('/profile',{method:'PATCH',cookie:admin,body:{name:'Ab',phone:''},headers:{Origin:'https://untrusted.example'}});assert.equal(wrongOrigin.status,403);
  assert.equal((await f.request('/ancestors/'+created.data.id,{method:'DELETE',cookie:admin})).status,200);
  assert.equal((await f.request('/ancestors/'+created.data.id,{method:'DELETE',cookie:admin})).status,404);
});
test('OTP dùng một lần, email có lời mời mới tham gia và giữ đúng quyền',async t=>{
  const f=await fixture(t),admin=await f.loginDemo();
  const invite=await f.request('/invitations',{method:'POST',cookie:admin,body:{name:'Nguyễn Thành Viên',email:'member2@example.test',role:'member'}});
  assert.equal(invite.status,201);assert.equal(f.outbox.length,0);
  const inviteToken=new URL(invite.data.url).searchParams.get('invite');
  const unknown=await f.request('/auth/request-code',{method:'POST',body:{email:'stranger@example.test',inviteToken}});assert.equal(unknown.status,200);assert.equal(f.outbox.length,0);
  const request=await f.request('/auth/request-code',{method:'POST',body:{email:'member2@example.test',inviteToken}});
  const code=f.outbox.at(-1).text.match(/\b\d{6}\b/)[0];
  assert.equal((await f.request('/auth/verify',{method:'POST',body:{challengeId:request.data.challengeId,code:'000000'}})).status,400);
  const verify=await f.request('/auth/verify',{method:'POST',body:{challengeId:request.data.challengeId,code}});assert.equal(verify.status,200);assert.equal(verify.data.user.role,'member');
  assert.equal((await f.request('/auth/verify',{method:'POST',body:{challengeId:request.data.challengeId,code}})).status,400);
  assert.equal((await f.request('/invitation?token='+inviteToken)).status,404);
  assert.equal((await f.request('/ancestors',{method:'POST',cookie:verify.cookie,body:person})).status,403);
  const revoke=await f.request('/members/'+verify.data.user.id,{method:'PATCH',cookie:admin,body:{active:false}});assert.equal(revoke.status,200);
  assert.equal((await f.request('/bootstrap',{cookie:verify.cookie})).status,401);
});
test('Khởi tạo quản lý bằng OTP và cô lập dòng họ, bảo vệ quản lý cuối cùng',async t=>{
  const f=await fixture(t),demo=await f.loginDemo();
  const challenge=await f.request('/auth/request-code',{method:'POST',body:{email:'admin@example.test'}});
  const code=f.outbox.at(-1).text.match(/\b\d{6}\b/)[0];
  const login=await f.request('/auth/verify',{method:'POST',body:{challengeId:challenge.data.challengeId,code}});
  const bootstrap=await f.request('/bootstrap',{cookie:login.cookie});assert.equal(bootstrap.data.ancestors.length,0);assert.notEqual(bootstrap.data.family.id,'demo-family');
  const otherPerson=(await f.request('/bootstrap',{cookie:demo})).data.ancestors[0];
  assert.equal((await f.request('/ancestors/'+otherPerson.id,{method:'DELETE',cookie:login.cookie})).status,404);
  assert.equal((await f.request('/members/'+login.data.user.id,{method:'PATCH',cookie:login.cookie,body:{role:'member'}})).status,400);
  const exportRes=await f.request('/calendar.ics',{cookie:demo});assert.equal(exportRes.status,200);assert.ok(exportRes.data.startsWith('BEGIN:VCALENDAR\r\n'));assert.ok(exportRes.data.includes('DTEND;VALUE=DATE:'));
  assert.equal((await f.request('/auth/logout',{method:'POST',cookie:login.cookie})).status,200);
  assert.equal((await f.request('/bootstrap',{cookie:login.cookie})).status,401);
});
test('OTP giới hạn số lần thử và lời mời bị thu hồi không còn đăng ký được',async t=>{
  const f=await fixture(t),admin=await f.loginDemo();
  const invite=await f.request('/invitations',{method:'POST',cookie:admin,body:{name:'Người được mời',email:'invited@example.test',role:'member'}});
  const inviteToken=new URL(invite.data.url).searchParams.get('invite');
  const request=await f.request('/auth/request-code',{method:'POST',body:{email:'invited@example.test',inviteToken}}),code=f.outbox.at(-1).text.match(/\b\d{6}\b/)[0];
  for(let i=0;i<5;i++)assert.equal((await f.request('/auth/verify',{method:'POST',body:{challengeId:request.data.challengeId,code:'000000'}})).status,400);
  assert.equal((await f.request('/auth/verify',{method:'POST',body:{challengeId:request.data.challengeId,code}})).status,400);
  const second=await f.request('/auth/request-code',{method:'POST',body:{email:'invited@example.test',inviteToken}}),secondCode=f.outbox.at(-1).text.match(/\b\d{6}\b/)[0];
  await f.request('/invitations/'+invite.data.id,{method:'DELETE',cookie:admin});
  assert.equal((await f.request('/auth/verify',{method:'POST',body:{challengeId:second.data.challengeId,code:secondCode}})).status,403);
});
test('Nhắc đúng giờ Việt Nam, không gửi lặp ở lần chạy tiếp theo, tôn trọng tắt nhắc',async t=>{
  const f=await fixture(t,{remindersEnabled:true});
  const uid=randomUUID(),pid=randomUUID();
  f.db.prepare('INSERT INTO families(id,name) VALUES(?,?)').run('real-test','Dòng họ kiểm thử');
  f.db.prepare('INSERT INTO users(id,family_id,email,name,role) VALUES(?,?,?,?,?)').run(uid,'real-test','test@example.test','Người thử','admin');
  f.db.prepare('INSERT INTO reminder_preferences(user_id,enabled,days,hour,minute,all_events) VALUES(?,1,\'[7,3,0]\',7,0,1)').run(uid);
  const lunar=lunarDate('2026-09-18');
  f.db.prepare('INSERT INTO ancestors(id,family_id,name,generation,lunar_day,lunar_month,created_by) VALUES(?,?,?,?,?,?,?)').run(pid,'real-test','Cụ Kiểm Thử',3,lunar.day,lunar.month,uid);
  assert.deepEqual(await runReminders({...f,now:new Date('2026-09-14T23:59:00Z')}),{sent:0,failed:0});
  assert.deepEqual(await runReminders({...f,now:new Date('2026-09-15T00:00:00Z')}),{sent:1,failed:0});
  assert.equal(f.outbox.length,1);assert.match(f.outbox[0].text,/Còn 3 ngày/);
  assert.deepEqual(await runReminders({...f,now:new Date('2026-09-15T01:00:00Z')}),{sent:0,failed:0});
  f.db.prepare('UPDATE reminder_preferences SET enabled=0 WHERE user_id=?').run(uid);
  assert.deepEqual(await runReminders({...f,now:new Date('2026-09-18T00:00:00Z')}),{sent:0,failed:0});
});
