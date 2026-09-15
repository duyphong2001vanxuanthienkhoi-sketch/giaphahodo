import { hash } from './security.js';
import { todayInVietnam,addDays,occurrences,vietnamClock,solarLabel } from '../shared/lunar.js';

export async function runReminders({db,mailer,config,now=new Date()}) {
  if(!config.remindersEnabled)return {sent:0,failed:0};
  const today=todayInVietnam(now),clock=vietnamClock(now),timestamp=+now;
  const users=db.prepare('SELECT u.*,p.enabled,p.days,p.hour,p.minute,p.all_events FROM users u JOIN reminder_preferences p ON p.user_id=u.id WHERE u.active=1 AND p.enabled=1').all();
  let sent=0,failed=0;
  for(const user of users) {
    if(user.family_id==='demo-family')continue; // Demo must never send mail.
    if(clock<user.hour*60+user.minute)continue;
    const ancestors=db.prepare('SELECT * FROM ancestors WHERE family_id=? AND deleted_at IS NULL').all(user.family_id);
    const subscriptions=new Set(db.prepare('SELECT ancestor_id FROM subscriptions WHERE user_id=?').all(user.id).map(x=>x.ancestor_id));
    const days=JSON.parse(user.days);
    if(!days.length)continue;
    for(const event of occurrences(ancestors,today,addDays(today,Math.max(...days)))) {
      if(!days.includes(event.daysAway)||(!user.all_events&&!subscriptions.has(event.id)))continue;
      const key=`${user.id}:${event.id}:${event.date}:${event.daysAway}`;
      const existing=db.prepare('SELECT * FROM mail_deliveries WHERE delivery_key=?').get(key);
      if(existing&&(existing.status==='sent'||existing.attempts>=5||timestamp-existing.attempted_at<15*60000))continue;
      // One process owns the scheduler. A durable key prevents normal duplicate runs.
      db.prepare("INSERT INTO mail_deliveries(delivery_key,user_id,ancestor_id,status,attempts,attempted_at) VALUES(?,?,?,'pending',1,?) ON CONFLICT(delivery_key) DO UPDATE SET status='pending',attempts=attempts+1,attempted_at=excluded.attempted_at,error=NULL").run(key,user.id,event.id,timestamp);
      try {
        const lead=event.daysAway===0?'Hôm nay':`Còn ${event.daysAway} ngày`;
        await mailer.send({to:user.email,id:hash(key),subject:`Cội · ${lead}: ngày giỗ ${event.name}`,
          text:`Chào ${user.name},\n\n${lead} là ngày giỗ ${event.name}.\nÂm lịch: ${event.lunar_day}/${event.lunar_month}${event.lunar.leap?' (tháng nhuận)':''}.\nDương lịch: ${solarLabel(event.date)}.${event.shifted?'\nTháng này có 29 ngày; gia đình đã chọn làm giỗ vào ngày cuối tháng.':''}\nĐịa điểm: ${event.location||'Gia đình sẽ cập nhật'}.\n${event.note?`Ghi chú: ${event.note}\n`:''}\nXem lịch và thay đổi hoặc tắt lời nhắc: ${config.appUrl}/#account\n\nCội · Gìn giữ nếp nhà.`});
        db.prepare("UPDATE mail_deliveries SET status='sent',sent_at=?,error=NULL WHERE delivery_key=?").run(now.toISOString(),key);sent++;
      } catch(error) {
        db.prepare("UPDATE mail_deliveries SET status='failed',error=? WHERE delivery_key=?").run(String(error.code||'MAIL_FAILED').slice(0,100),key);failed++;
      }
    }
  }
  db.prepare('DELETE FROM sessions WHERE expires_at<?').run(timestamp);
  db.prepare('DELETE FROM otp_challenges WHERE expires_at<?').run(timestamp);
  db.prepare('DELETE FROM mail_deliveries WHERE attempted_at<?').run(timestamp-180*86400000);
  db.prepare('DELETE FROM attendance WHERE event_date<?').run(addDays(today,-400));
  return {sent,failed};
}
export function startScheduler(context) {
  let busy=false;
  const tick=async()=>{if(busy)return;busy=true;try{await runReminders(context);}catch(error){console.error('[Cội] Reminder job failed:',error.name);}finally{busy=false;}};
  const timer=setInterval(tick,60000);timer.unref();void tick();return ()=>clearInterval(timer);
}
