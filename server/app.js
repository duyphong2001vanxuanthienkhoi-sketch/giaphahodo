import express from 'express';
import helmet from 'helmet';
import qrcode from 'qrcode-generator';
import { randomInt, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { openDatabase, transaction } from './db.js';
import { createMailer } from './mail.js';
import { AppError, hash, token, otpHash, sameHash, limit, readCookie } from './security.js';
import { parse, emailSchema, ancestorSchema, preferenceSchema, profileSchema, inviteSchema, familySchema, memorySchema, attendanceSchema, photoSchema } from './validation.js';
import { decodeImage, writePhoto, readPhoto, removePhoto } from './storage.js';
import { buildCalendar } from './calendar.js';
import { seedDemo } from './seed.js';
import { occurrences, todayInVietnam, addDays, DEFAULT_OBSERVANCES } from '../shared/lunar.js';

const FEED_DAYS = 5 * 365 + 2;

export function createApp(config, options = {}) {
  const db = options.db || openDatabase(config.dbPath);
  const mailer = options.mailer || createMailer(config);
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: config.production ? {
    directives: { defaultSrc:["'self'"], scriptSrc:["'self'"], styleSrc:["'self'","'unsafe-inline'"], fontSrc:["'self'"], imgSrc:["'self'",'data:'], connectSrc:["'self'"], objectSrc:["'none'"], frameAncestors:["'none'"], baseUri:["'self'"] },
  } : false, crossOriginEmbedderPolicy:false, strictTransportSecurity:config.production }));
  // A downscaled portrait arrives as one JSON body; every other route stays small.
  const photoBody = express.json({ limit:'6mb' });
  app.use((req,res,next) => req.method==='POST' && /^\/api\/ancestors\/[^/]+\/photos$/.test(req.path) ? photoBody(req,res,next) : next());
  app.use(express.json({ limit:'64kb' }));
  app.use('/api', (req,res,next) => {
    res.set('Cache-Control','no-store');
    if (!['GET','HEAD','OPTIONS'].includes(req.method)) {
      const origin = req.headers.origin;
      const allowed = new Set([new URL(config.appUrl).origin]);
      if (!config.production) {allowed.add('http://localhost:5173');allowed.add('http://127.0.0.1:5173');allowed.add('http://127.0.0.1:3001');allowed.add('http://localhost:3001');}
      if (req.headers['x-coi-request'] !== '1' || (origin && !allowed.has(origin))) return next(new AppError(403,'Yêu cầu không hợp lệ. Hãy tải lại Cội rồi thử lại.'));
    }
    next();
  });
  function auth(req,res,next) {
    const raw = readCookie(req,'coi_session');
    const user = raw ? db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1').get(hash(raw),Date.now()) : null;
    if (!user) return next(new AppError(401,'Phiên đăng nhập đã hết. Vui lòng đăng nhập lại.'));
    req.user = user; next();
  }
  function admin(req,res,next) { if(req.user.role !== 'admin') return next(new AppError(403,'Chỉ người quản lý được thực hiện thao tác này.')); next(); }
  function session(res,user) {
    const raw = token();
    db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(raw),user.id,Date.now()+30*86400000);
    res.cookie('coi_session',raw,{httpOnly:true,secure:config.production,sameSite:'lax',maxAge:30*86400000,path:'/'});
    return user;
  }
  const getInvite = raw => typeof raw === 'string' && /^[a-f0-9]{64}$/.test(raw) ? db.prepare('SELECT * FROM invitations WHERE token_hash=? AND expires_at>? AND used_at IS NULL AND revoked_at IS NULL').get(hash(raw),Date.now()) : null;
  const preferences = id => {
    db.prepare('INSERT OR IGNORE INTO reminder_preferences(user_id) VALUES(?)').run(id);
    const row = db.prepare('SELECT * FROM reminder_preferences WHERE user_id=?').get(id);
    return {...row,enabled:!!row.enabled,all_events:!!row.all_events,days:JSON.parse(row.days)};
  };
  const livingAncestors = familyId => db.prepare('SELECT * FROM ancestors WHERE family_id=? AND deleted_at IS NULL ORDER BY generation,name').all(familyId);
  const familyObservances = family => {
    try { const keys = JSON.parse(family.observances ?? '[]'); return Array.isArray(keys) ? keys : DEFAULT_OBSERVANCES; }
    catch { return DEFAULT_OBSERVANCES; }
  };
  function scopedAncestor(id,user) {
    const ancestor = db.prepare('SELECT * FROM ancestors WHERE id=? AND family_id=? AND deleted_at IS NULL').get(id,user.family_id);
    if (!ancestor) throw new AppError(404,'Không tìm thấy người thân này.');
    return ancestor;
  }
  const cleanUser = u => ({id:u.id,name:u.name,email:u.email,phone:u.phone,share_phone:!!u.share_phone,role:u.role,family_id:u.family_id});
  // The feed URL is a read-only capability the member re-opens on every device, so it is
  // stored as issued and rotated on demand rather than hashed like a session.
  function calendarToken(userId) {
    const row = db.prepare('SELECT token FROM calendar_tokens WHERE user_id=?').get(userId);
    if (row) return row.token;
    const value = token();
    db.prepare('INSERT INTO calendar_tokens(user_id,token) VALUES(?,?)').run(userId,value);
    return value;
  }
  function feedUrls(value) {
    const url = new URL(config.appUrl);
    url.pathname = `/api/calendar/${value}/lich-ngay-gio.ics`; url.search = '';
    return { url:url.toString(), webcal:url.toString().replace(/^https?:/,'webcal:') };
  }

  app.get('/api/health', (req,res) => res.json({ok:true}));
  app.get('/api/config', (req,res) => res.json({demo:config.demo,mailPreview:!config.production && config.mailDriver==='preview',familyName:config.familyName}));
  app.get('/api/invitation', (req,res) => {
    const invite = getInvite(req.query.token);
    if (!invite) throw new AppError(404,'Lời mời đã hết hạn hoặc không còn hiệu lực. Hãy xin link mời mới.');
    const family = db.prepare('SELECT name FROM families WHERE id=?').get(invite.family_id);
    // The email itself is not disclosed to anyone merely holding a link.
    res.json({name:invite.name,familyName:family.name,role:invite.role});
  });
  app.post('/api/auth/request-code', async(req,res) => {
    const {email,inviteToken} = parse(z.object({email:emailSchema,inviteToken:z.string().max(128).optional()}).strict(),req.body);
    limit(db,'otp-ip:'+hash(req.ip),15,15*60000);
    limit(db,'otp-email:'+hash(email),5,15*60000);
    const invite = getInvite(inviteToken);
    const user = db.prepare('SELECT * FROM users WHERE email=? AND active=1').get(email);
    const bootstrap = email === config.adminEmail && !db.prepare("SELECT id FROM families WHERE id!='demo-family'").get();
    const eligible = user || (invite && invite.email === email) || bootstrap;
    const id = randomUUID();
    if (eligible) {
      const code = String(randomInt(100000,1000000));
      db.prepare('DELETE FROM otp_challenges WHERE email=? OR expires_at<?').run(email,Date.now());
      db.prepare('INSERT INTO otp_challenges(id,email,code_hash,invite_hash,expires_at) VALUES(?,?,?,?,?)').run(id,email,otpHash(config.secret,id,code),invite?.token_hash || null,Date.now()+10*60000);
      try { await mailer.send({to:email,subject:'Mã đăng nhập Cội',text:`Mã xác nhận của bạn là ${code}.\nMã có hiệu lực 10 phút và chỉ dùng một lần.\nKhông chia sẻ mã này cho người khác.\n\nNếu bạn không yêu cầu đăng nhập, hãy bỏ qua email này.`}); }
      catch { db.prepare('DELETE FROM otp_challenges WHERE id=?').run(id); throw new AppError(503,'Chưa gửi được mã xác nhận. Vui lòng thử lại sau.'); }
    }
    res.json({challengeId:id,message:'Nếu email đã được mời vào dòng họ, bạn sẽ nhận được mã xác nhận.'});
  });
  app.post('/api/auth/verify', (req,res) => {
    const {challengeId,code} = parse(z.object({challengeId:z.string().uuid(),code:z.string().regex(/^\d{6}$/)}).strict(),req.body);
    limit(db,'verify-ip:'+hash(req.ip),30,15*60000);
    const challenge = db.prepare('SELECT * FROM otp_challenges WHERE id=?').get(challengeId);
    if (!challenge || challenge.expires_at < Date.now() || challenge.attempts >= 5) throw new AppError(400,'Mã không hợp lệ hoặc đã hết hạn. Hãy yêu cầu mã mới.');
    db.prepare('UPDATE otp_challenges SET attempts=attempts+1 WHERE id=?').run(challengeId);
    if (!sameHash(challenge.code_hash,otpHash(config.secret,challengeId,code))) throw new AppError(400,'Mã xác nhận chưa đúng.');
    const user = transaction(db, () => {
      let u = db.prepare('SELECT * FROM users WHERE email=? AND active=1').get(challenge.email);
      if (!u) {
        const invitation = challenge.invite_hash ? db.prepare('SELECT * FROM invitations WHERE token_hash=? AND email=? AND expires_at>? AND used_at IS NULL AND revoked_at IS NULL').get(challenge.invite_hash,challenge.email,Date.now()) : null;
        let familyId,role,name;
        if (invitation) {
          familyId=invitation.family_id;role=invitation.role;name=invitation.name;
          db.prepare('UPDATE invitations SET used_at=? WHERE id=?').run(Date.now(),invitation.id);
        } else if (challenge.email===config.adminEmail && !db.prepare("SELECT id FROM families WHERE id!='demo-family'").get()) {
          familyId=randomUUID();role='admin';name='Người quản lý';
          db.prepare('INSERT INTO families(id,name) VALUES(?,?)').run(familyId,config.familyName);
        } else throw new AppError(403,'Bạn cần một lời mời còn hiệu lực để tham gia dòng họ.');
        const oldUser = db.prepare('SELECT * FROM users WHERE email=?').get(challenge.email);
        if (oldUser) {
          if (oldUser.family_id!==familyId) throw new AppError(409,'Email này thuộc một dòng họ khác.');
          db.prepare('UPDATE users SET active=1,role=?,name=? WHERE id=?').run(role,name,oldUser.id);
          u=db.prepare('SELECT * FROM users WHERE id=?').get(oldUser.id);
        } else {
          const id=randomUUID();
          db.prepare('INSERT INTO users(id,family_id,email,name,role) VALUES(?,?,?,?,?)').run(id,familyId,challenge.email,name,role);
          u=db.prepare('SELECT * FROM users WHERE id=?').get(id);
        }
      }
      db.prepare('DELETE FROM otp_challenges WHERE email=?').run(challenge.email);
      return u;
    });
    session(res,user);res.json({user:cleanUser(user)});
  });
  if (config.demo) app.post('/api/auth/demo', (req,res) => {
    const {role} = parse(z.object({role:z.enum(['admin','member'])}).strict(),req.body);
    const user=seedDemo(db,role); session(res,user);res.json({user:cleanUser(user)});
  });
  app.post('/api/auth/logout', auth, (req,res) => {
    db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(readCookie(req,'coi_session')));
    res.clearCookie('coi_session',{path:'/',httpOnly:true,secure:config.production,sameSite:'lax'});res.json({ok:true});
  });
  app.get('/api/bootstrap', auth, (req,res) => {
    const {user}=req, today=todayInVietnam();
    const family=db.prepare('SELECT * FROM families WHERE id=?').get(user.family_id);
    const memorySql='SELECT m.id,m.ancestor_id,m.body,m.status,m.created_at,m.author_id,u.name AS author_name FROM memories m JOIN users u ON u.id=m.author_id WHERE m.family_id=?';
    res.json({user:cleanUser(user),family:{...family,observances:familyObservances(family)},
      ancestors:livingAncestors(user.family_id),
      members:db.prepare("SELECT id,name,email,role,created_at,CASE WHEN share_phone=1 THEN phone ELSE '' END AS phone FROM users WHERE family_id=? AND active=1 ORDER BY role,created_at").all(user.family_id),
      preferences:preferences(user.id),subscriptions:db.prepare('SELECT ancestor_id FROM subscriptions WHERE user_id=?').all(user.id).map(x=>x.ancestor_id),
      memories:user.role==='admin'
        ? db.prepare(memorySql+' ORDER BY m.created_at DESC LIMIT 300').all(user.family_id)
        : db.prepare(memorySql+" AND (m.status='approved' OR m.author_id=?) ORDER BY m.created_at DESC LIMIT 300").all(user.family_id,user.id),
      attendance:db.prepare('SELECT a.ancestor_id,a.event_date,a.status,a.note,a.user_id,u.name AS user_name FROM attendance a JOIN users u ON u.id=a.user_id WHERE u.family_id=? AND a.event_date>=? ORDER BY a.event_date').all(user.family_id,today),
      photos:db.prepare('SELECT id,ancestor_id,caption,bytes,created_at FROM photos WHERE family_id=? ORDER BY created_at').all(user.family_id),
      trash:user.role==='admin'?db.prepare('SELECT id,name,generation,branch,lunar_day,lunar_month,deleted_at FROM ancestors WHERE family_id=? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 50').all(user.family_id):[],
      calendar:feedUrls(calendarToken(user.id)),
      demo:user.family_id==='demo-family',today,
      invitations:user.role==='admin'?db.prepare('SELECT id,email,name,role,expires_at,used_at,revoked_at FROM invitations WHERE family_id=? ORDER BY created_at DESC LIMIT 50').all(user.family_id):[],
      deliveries:db.prepare('SELECT d.id,d.status,d.sent_at,d.attempted_at,a.name FROM mail_deliveries d JOIN ancestors a ON a.id=d.ancestor_id WHERE d.user_id=? ORDER BY d.attempted_at DESC LIMIT 20').all(user.id),
    });
  });
  app.patch('/api/profile',auth,(req,res) => {
    const body=parse(profileSchema,req.body);
    db.prepare('UPDATE users SET name=?,phone=?,share_phone=? WHERE id=?').run(body.name,body.phone,+body.share_phone,req.user.id);res.json({ok:true});
  });
  app.patch('/api/preferences',auth,(req,res) => {
    const b=parse(preferenceSchema,req.body);preferences(req.user.id);
    db.prepare('UPDATE reminder_preferences SET enabled=?,days=?,hour=?,minute=?,all_events=? WHERE user_id=?').run(+b.enabled,JSON.stringify([...new Set(b.days)].sort((a,b)=>b-a)),b.hour,b.minute,+b.all_events,req.user.id);res.json({ok:true});
  });
  app.put('/api/subscriptions/:id',auth,(req,res) => {
    scopedAncestor(req.params.id,req.user);const {enabled}=parse(z.object({enabled:z.boolean()}).strict(),req.body);
    if(enabled)db.prepare('INSERT OR IGNORE INTO subscriptions VALUES(?,?)').run(req.user.id,req.params.id);
    else db.prepare('DELETE FROM subscriptions WHERE user_id=? AND ancestor_id=?').run(req.user.id,req.params.id);
    res.json({ok:true});
  });
  function validateParent(body,user,currentId) {
    if (!body.parent_id) return;
    if(body.parent_id===currentId)throw new AppError(400,'Một người không thể là cha/mẹ của chính mình.');
    const parent=scopedAncestor(body.parent_id,user);
    if(parent.generation>=body.generation)throw new AppError(400,'Người thuộc thế hệ trước phải có số đời nhỏ hơn.');
  }
  function validateSpouse(body,user,currentId) {
    if (!body.spouse_id) return;
    if(body.spouse_id===currentId)throw new AppError(400,'Một người không thể là vợ/chồng của chính mình.');
    if(body.spouse_id===body.parent_id)throw new AppError(400,'Một người không thể vừa là cha/mẹ vừa là vợ/chồng.');
    scopedAncestor(body.spouse_id,user);
  }
  /** A marriage reads the same from both sides, so the back-link is written here and
   * whoever either side was previously paired with is released. */
  function syncSpouse(personId,previous,next,familyId) {
    if (previous===next) return;
    if (previous) db.prepare('UPDATE ancestors SET spouse_id=NULL,revision=revision+1 WHERE id=? AND family_id=? AND spouse_id=?').run(previous,familyId,personId);
    if (next) {
      const theirs=db.prepare('SELECT spouse_id FROM ancestors WHERE id=? AND family_id=?').get(next,familyId)?.spouse_id;
      if(theirs&&theirs!==personId)db.prepare('UPDATE ancestors SET spouse_id=NULL,revision=revision+1 WHERE id=? AND family_id=?').run(theirs,familyId);
      db.prepare('UPDATE ancestors SET spouse_id=?,revision=revision+1 WHERE id=? AND family_id=?').run(personId,next,familyId);
    }
  }
  app.post('/api/ancestors',auth,admin,(req,res) => {
    const b=parse(ancestorSchema,req.body);validateParent(b,req.user);validateSpouse(b,req.user);const id=randomUUID();
    const cols=Object.keys(b);
    transaction(db,()=>{
      db.prepare(`INSERT INTO ancestors(id,family_id,created_by,${cols.join(',')}) VALUES(${Array(cols.length+3).fill('?').join(',')})`).run(id,req.user.family_id,req.user.id,...Object.values(b));
      syncSpouse(id,null,b.spouse_id,req.user.family_id);
    });
    res.status(201).json({id});
  });
  app.put('/api/ancestors/:id',auth,admin,(req,res) => {
    const before=scopedAncestor(req.params.id,req.user);
    const b=parse(ancestorSchema,req.body);validateParent(b,req.user,req.params.id);validateSpouse(b,req.user,req.params.id);
    const child=db.prepare('SELECT generation FROM ancestors WHERE parent_id=? AND deleted_at IS NULL ORDER BY generation LIMIT 1').get(req.params.id);
    if(child&&child.generation<=b.generation)throw new AppError(400,'Số đời phải nhỏ hơn số đời của thế hệ con đã liên kết.');
    transaction(db,()=>{
      db.prepare(`UPDATE ancestors SET ${Object.keys(b).map(x=>x+'=?').join(',')},revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND family_id=?`).run(...Object.values(b),req.params.id,req.user.family_id);
      syncSpouse(req.params.id,before.spouse_id,b.spouse_id,req.user.family_id);
    });
    res.json({ok:true});
  });
  // Removing a person hides a lifetime of memories, so it is reversible from the trash.
  app.delete('/api/ancestors/:id',auth,admin,(req,res) => {
    scopedAncestor(req.params.id,req.user);
    db.prepare('UPDATE ancestors SET deleted_at=?,revision=revision+1 WHERE id=? AND family_id=?').run(Date.now(),req.params.id,req.user.family_id);res.json({ok:true});
  });
  app.post('/api/ancestors/:id/restore',auth,admin,(req,res) => {
    const result=db.prepare('UPDATE ancestors SET deleted_at=NULL,revision=revision+1 WHERE id=? AND family_id=? AND deleted_at IS NOT NULL').run(req.params.id,req.user.family_id);
    if(!result.changes)throw new AppError(404,'Không tìm thấy bản ghi trong thùng rác.');res.json({ok:true});
  });
  app.delete('/api/trash/:id',auth,admin,(req,res) => {
    const person=db.prepare('SELECT * FROM ancestors WHERE id=? AND family_id=? AND deleted_at IS NOT NULL').get(req.params.id,req.user.family_id);
    if(!person)throw new AppError(404,'Không tìm thấy bản ghi trong thùng rác.');
    const photos=db.prepare('SELECT * FROM photos WHERE ancestor_id=?').all(person.id);
    db.prepare('DELETE FROM ancestors WHERE id=?').run(person.id);
    for(const photo of photos)removePhoto(config.uploadDir,photo.id,photo.mime);
    res.json({ok:true});
  });
  const PHOTO_LIMIT=40;
  app.post('/api/ancestors/:id/photos',auth,admin,(req,res) => {
    const person=scopedAncestor(req.params.id,req.user);
    const body=parse(photoSchema,req.body);
    const {n}=db.prepare('SELECT count(*) AS n FROM photos WHERE ancestor_id=?').get(person.id);
    if(n>=PHOTO_LIMIT)throw new AppError(409,`Mỗi người thân giữ tối đa ${PHOTO_LIMIT} ảnh. Hãy xóa bớt trước khi thêm.`);
    const {mime,bytes}=decodeImage(body.data);
    const id=randomUUID();
    writePhoto(config.uploadDir,id,mime,bytes);
    transaction(db,()=>{
      db.prepare('INSERT INTO photos(id,family_id,ancestor_id,mime,bytes,caption,created_by) VALUES(?,?,?,?,?,?,?)').run(id,req.user.family_id,person.id,mime,bytes.length,body.caption,req.user.id);
      // The first photo of a person becomes the face shown everywhere else.
      if(!person.photo_id)db.prepare('UPDATE ancestors SET photo_id=? WHERE id=?').run(id,person.id);
      db.prepare('UPDATE ancestors SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(person.id);
    });
    res.status(201).json({id,portrait:!person.photo_id});
  });
  app.put('/api/ancestors/:id/portrait',auth,admin,(req,res) => {
    const person=scopedAncestor(req.params.id,req.user);
    const {photo_id}=parse(z.object({photo_id:z.string().uuid().nullable()}).strict(),req.body);
    if(photo_id&&!db.prepare('SELECT id FROM photos WHERE id=? AND ancestor_id=?').get(photo_id,person.id))throw new AppError(404,'Ảnh này không thuộc về người thân đã chọn.');
    db.prepare('UPDATE ancestors SET photo_id=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(photo_id,person.id);
    res.json({ok:true});
  });
  app.patch('/api/photos/:id',auth,admin,(req,res) => {
    const {caption}=parse(z.object({caption:z.string().trim().max(200)}).strict(),req.body);
    const result=db.prepare('UPDATE photos SET caption=? WHERE id=? AND family_id=?').run(caption,req.params.id,req.user.family_id);
    if(!result.changes)throw new AppError(404,'Không tìm thấy ảnh.');res.json({ok:true});
  });
  app.delete('/api/photos/:id',auth,admin,(req,res) => {
    const photo=db.prepare('SELECT * FROM photos WHERE id=? AND family_id=?').get(req.params.id,req.user.family_id);
    if(!photo)throw new AppError(404,'Không tìm thấy ảnh.');
    transaction(db,()=>{
      db.prepare('DELETE FROM photos WHERE id=?').run(photo.id);
      // ON DELETE SET NULL already cleared the portrait; fall back to another photo.
      const next=db.prepare('SELECT id FROM photos WHERE ancestor_id=? ORDER BY created_at LIMIT 1').get(photo.ancestor_id);
      db.prepare('UPDATE ancestors SET photo_id=COALESCE(photo_id,?),revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(next?.id||null,photo.ancestor_id);
    });
    removePhoto(config.uploadDir,photo.id,photo.mime);
    res.json({ok:true});
  });
  app.get('/api/photos/:id',auth,(req,res) => {
    const photo=db.prepare('SELECT * FROM photos WHERE id=? AND family_id=?').get(req.params.id,req.user.family_id);
    if(!photo)throw new AppError(404,'Không tìm thấy ảnh.');
    let bytes; try { bytes=readPhoto(config.uploadDir,photo.id,photo.mime); }
    catch { throw new AppError(404,'Tệp ảnh không còn trên máy chủ. Hãy tải lại ảnh.'); }
    res.type(photo.mime).set('Cache-Control','private, max-age=31536000, immutable').send(bytes);
  });
  app.post('/api/ancestors/:id/memories',auth,(req,res) => {
    const person=scopedAncestor(req.params.id,req.user);
    const b=parse(memorySchema,req.body);
    limit(db,'memory:'+req.user.id,20,3600000);
    const id=randomUUID(),status=req.user.role==='admin'?'approved':'pending';
    db.prepare('INSERT INTO memories(id,family_id,ancestor_id,author_id,body,status,reviewed_by,reviewed_at) VALUES(?,?,?,?,?,?,?,?)')
      .run(id,req.user.family_id,person.id,req.user.id,b.body,status,status==='approved'?req.user.id:null,status==='approved'?Date.now():null);
    res.status(201).json({id,status});
  });
  app.patch('/api/memories/:id',auth,admin,(req,res) => {
    const b=parse(z.object({status:z.enum(['approved','rejected'])}).strict(),req.body);
    const result=db.prepare('UPDATE memories SET status=?,reviewed_by=?,reviewed_at=? WHERE id=? AND family_id=?').run(b.status,req.user.id,Date.now(),req.params.id,req.user.family_id);
    if(!result.changes)throw new AppError(404,'Không tìm thấy ký ức này.');res.json({ok:true});
  });
  app.delete('/api/memories/:id',auth,(req,res) => {
    const row=db.prepare('SELECT * FROM memories WHERE id=? AND family_id=?').get(req.params.id,req.user.family_id);
    if(!row)throw new AppError(404,'Không tìm thấy ký ức này.');
    if(req.user.role!=='admin'&&row.author_id!==req.user.id)throw new AppError(403,'Bạn chỉ xóa được ký ức do mình gửi.');
    db.prepare('DELETE FROM memories WHERE id=?').run(row.id);res.json({ok:true});
  });
  app.put('/api/attendance/:id',auth,(req,res) => {
    const person=scopedAncestor(req.params.id,req.user);
    const b=parse(attendanceSchema,req.body),today=todayInVietnam();
    if(b.event_date<today)throw new AppError(400,'Chỉ ghi nhận cho ngày giỗ sắp tới.');
    if(!occurrences([person],today,addDays(today,400)).some(e=>e.date===b.event_date))throw new AppError(400,'Ngày này không phải ngày giỗ của người thân đã chọn.');
    db.prepare('INSERT INTO attendance(user_id,ancestor_id,event_date,status,note,updated_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id,ancestor_id,event_date) DO UPDATE SET status=excluded.status,note=excluded.note,updated_at=CURRENT_TIMESTAMP')
      .run(req.user.id,person.id,b.event_date,b.status,b.note);
    res.json({ok:true});
  });
  app.patch('/api/family',auth,admin,(req,res) => {
    const b=parse(familySchema,req.body);
    db.prepare('UPDATE families SET name=?,home=?,observances=? WHERE id=?').run(b.name,b.home,JSON.stringify([...new Set(b.observances)]),req.user.family_id);res.json({ok:true});
  });
  app.post('/api/invitations',auth,admin,(req,res) => {
    const b=parse(inviteSchema,req.body);limit(db,'invite:'+req.user.id,30,3600000);
    if(db.prepare('SELECT id FROM users WHERE email=? AND active=1').get(b.email))throw new AppError(409,'Email này đã có tài khoản đang hoạt động.');
    const raw=token(),id=randomUUID(),expiresAt=Date.now()+7*86400000;
    transaction(db,()=>{
      db.prepare('UPDATE invitations SET revoked_at=? WHERE email=? AND family_id=? AND used_at IS NULL').run(Date.now(),b.email,req.user.family_id);
      db.prepare('INSERT INTO invitations(id,family_id,email,name,role,token_hash,created_by,expires_at) VALUES(?,?,?,?,?,?,?,?)').run(id,req.user.family_id,b.email,b.name,b.role,hash(raw),req.user.id,expiresAt);
    });
    const url=new URL(config.appUrl);url.searchParams.set('invite',raw);
    // The invitation is copied by the administrator; no unsolicited email is sent.
    res.status(201).json({id,url:url.toString(),expiresAt});
  });
  app.delete('/api/invitations/:id',auth,admin,(req,res) => {
    const result=db.prepare('UPDATE invitations SET revoked_at=? WHERE id=? AND family_id=? AND used_at IS NULL').run(Date.now(),req.params.id,req.user.family_id);
    if(!result.changes)throw new AppError(404,'Không tìm thấy lời mời còn hiệu lực.');res.json({ok:true});
  });
  app.patch('/api/members/:id',auth,admin,(req,res) => {
    const b=parse(z.object({role:z.enum(['admin','member']).optional(),active:z.boolean().optional()}).strict().refine(x=>Object.keys(x).length>0),req.body);
    const member=db.prepare('SELECT * FROM users WHERE id=? AND family_id=? AND active=1').get(req.params.id,req.user.family_id);
    if(!member)throw new AppError(404,'Không tìm thấy thành viên.');
    if(b.active===false&&member.id===req.user.id)throw new AppError(400,'Bạn không thể tự thu hồi quyền truy cập của mình.');
    if(member.role==='admin'&&(b.role==='member'||b.active===false)) {
      const {n}=db.prepare("SELECT count(*) AS n FROM users WHERE family_id=? AND active=1 AND role='admin'").get(req.user.family_id);
      if(n<=1)throw new AppError(400,'Dòng họ cần ít nhất một người quản lý.');
    }
    db.prepare('UPDATE users SET role=?,active=? WHERE id=?').run(b.role||member.role,b.active===undefined?1:+b.active,member.id);
    if(b.active===false)db.prepare('DELETE FROM sessions WHERE user_id=?').run(member.id);
    res.json({ok:true});
  });
  function calendarFor(user) {
    const family=db.prepare('SELECT * FROM families WHERE id=?').get(user.family_id);
    const from=todayInVietnam();
    return buildCalendar({familyName:family.name,ancestors:livingAncestors(user.family_id),
      observanceKeys:familyObservances(family),from,to:addDays(from,FEED_DAYS),reminder:preferences(user.id)});
  }
  // Subscribing clients poll without a session, so the path token is the credential.
  app.get('/api/calendar/:token/lich-ngay-gio.ics',(req,res) => {
    limit(db,'feed-ip:'+hash(req.ip),300,3600000);
    if(!/^[a-f0-9]{64}$/.test(req.params.token))throw new AppError(404,'Link lịch không còn hiệu lực.');
    const owner=db.prepare('SELECT u.* FROM calendar_tokens c JOIN users u ON u.id=c.user_id WHERE c.token=? AND u.active=1').get(req.params.token);
    if(!owner)throw new AppError(404,'Link lịch không còn hiệu lực. Hãy mở Cội và tạo link mới.');
    res.type('text/calendar').set('Cache-Control','private, max-age=3600').send(calendarFor(owner));
  });
  app.get('/api/calendar.ics',auth,(req,res) => {
    res.type('text/calendar').set('Content-Disposition','attachment; filename="coi-lich-ngay-gio.ics"').send(calendarFor(req.user));
  });
  app.post('/api/calendar-token',auth,(req,res) => {
    const value=token();
    db.prepare('INSERT INTO calendar_tokens(user_id,token) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET token=excluded.token,created_at=CURRENT_TIMESTAMP').run(req.user.id,value);
    res.json(feedUrls(value));
  });
  app.get('/api/calendar-qr.svg',auth,(req,res) => {
    const qr=qrcode(0,'M');qr.addData(feedUrls(calendarToken(req.user.id)).webcal);qr.make();
    res.type('image/svg+xml').send(qr.createSvgTag({cellSize:4,margin:2,scalable:true}));
  });
  app.get('/api/export.json',auth,admin,(req,res) => {
    const family=db.prepare('SELECT * FROM families WHERE id=?').get(req.user.family_id);
    res.type('application/json').set('Content-Disposition','attachment; filename="coi-du-lieu-dong-ho.json"').send(JSON.stringify({
      exportedAt:new Date().toISOString(),
      note:'Ảnh chân dung được lưu thành tệp trong UPLOAD_DIR và nằm trong bản sao lưu của npm run backup, không nằm trong tệp này.',
      family:{...family,observances:familyObservances(family)},
      members:db.prepare('SELECT id,name,email,role,phone,share_phone,active,created_at FROM users WHERE family_id=?').all(req.user.family_id),
      ancestors:db.prepare('SELECT * FROM ancestors WHERE family_id=?').all(req.user.family_id),
      memories:db.prepare('SELECT m.*,u.email AS author_email FROM memories m JOIN users u ON u.id=m.author_id WHERE m.family_id=?').all(req.user.family_id),
      attendance:db.prepare('SELECT a.* FROM attendance a JOIN users u ON u.id=a.user_id WHERE u.family_id=?').all(req.user.family_id),
    },null,2));
  });
  app.use('/api',(req,res,next)=>next(new AppError(404,'Không tìm thấy chức năng này.')));
  const dist=resolve('dist');
  if(existsSync(resolve(dist,'index.html'))) {
    app.use(express.static(dist,{index:false}));
    app.get('/{*path}',(req,res)=>res.sendFile(resolve(dist,'index.html')));
  }
  app.use((error,req,res,next)=>{
    const status=error.status||(error.type==='entity.parse.failed'?400:error.type==='entity.too.large'?413:500);
    if(status>=500)console.error('[Cội] Request failed:',error.name);
    res.status(status).json({error:status<500?error.message:'Cội chưa xử lý được yêu cầu. Vui lòng thử lại sau.'});
  });
  return {app,db,mailer};
}
