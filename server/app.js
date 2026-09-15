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
import { decodeImage, createStorage } from './storage.js';
import { buildCalendar } from './calendar.js';
import { seedDemo } from './seed.js';
import { runReminders } from './reminders.js';
import { occurrences, todayInVietnam, addDays, DEFAULT_OBSERVANCES } from '../shared/lunar.js';

const FEED_DAYS = 5 * 365 + 2;

export async function createApp(config, options = {}) {
  const db = options.db || await openDatabase(config.databaseUrl || config.dbPath);
  const mailer = options.mailer || createMailer(config);
  const store = createStorage(config);
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
  async function auth(req,res,next) {
    const raw = readCookie(req,'coi_session');
    const user = raw ? await db.get('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1', hash(raw),Date.now()) : null;
    if (!user) return next(new AppError(401,'Phiên đăng nhập đã hết. Vui lòng đăng nhập lại.'));
    req.user = user; next();
  }
  function admin(req,res,next) { if(req.user.role !== 'admin') return next(new AppError(403,'Chỉ người quản lý được thực hiện thao tác này.')); next(); }
  async function session(res,user) {
    const raw = token();
    await db.run('INSERT INTO sessions VALUES(?,?,?)', hash(raw),user.id,Date.now()+30*86400000);
    res.cookie('coi_session',raw,{httpOnly:true,secure:config.production,sameSite:'lax',maxAge:30*86400000,path:'/'});
    return user;
  }
  const getInvite = async raw => typeof raw === 'string' && /^[a-f0-9]{64}$/.test(raw) ? await db.get('SELECT * FROM invitations WHERE token_hash=? AND expires_at>? AND used_at IS NULL AND revoked_at IS NULL', hash(raw),Date.now()) : null;
  const preferences = async id => {
    await db.run('INSERT INTO reminder_preferences(user_id) VALUES(?) ON CONFLICT DO NOTHING', id);
    const row = await db.get('SELECT * FROM reminder_preferences WHERE user_id=?', id);
    return {...row,enabled:!!row.enabled,all_events:!!row.all_events,days:JSON.parse(row.days)};
  };
  const livingAncestors = async familyId => await db.all('SELECT * FROM ancestors WHERE family_id=? AND deleted_at IS NULL ORDER BY generation,name', familyId);
  const familyObservances = family => {
    try { const keys = JSON.parse(family.observances ?? '[]'); return Array.isArray(keys) ? keys : DEFAULT_OBSERVANCES; }
    catch { return DEFAULT_OBSERVANCES; }
  };
  async function scopedAncestor(id,user) {
    const ancestor = await db.get('SELECT * FROM ancestors WHERE id=? AND family_id=? AND deleted_at IS NULL', id,user.family_id);
    if (!ancestor) throw new AppError(404,'Không tìm thấy người thân này.');
    return ancestor;
  }
  const cleanUser = u => ({id:u.id,name:u.name,email:u.email,phone:u.phone,share_phone:!!u.share_phone,role:u.role,family_id:u.family_id});
  // The feed URL is a read-only capability the member re-opens on every device, so it is
  // stored as issued and rotated on demand rather than hashed like a session.
  async function calendarToken(userId) {
    const row = await db.get('SELECT token FROM calendar_tokens WHERE user_id=?', userId);
    if (row) return row.token;
    const value = token();
    await db.run('INSERT INTO calendar_tokens(user_id,token) VALUES(?,?)', userId,value);
    return value;
  }
  function feedUrls(value) {
    const url = new URL(config.appUrl);
    url.pathname = `/api/calendar/${value}/lich-ngay-gio.ics`; url.search = '';
    return { url:url.toString(), webcal:url.toString().replace(/^https?:/,'webcal:') };
  }

  /** Nhật ký quản trị: ai vào, ai được tạo, ai đổi quyền. Ghi vào bảng chứ không ra
   * tệp, vì đĩa của nền serverless chỉ đọc được. Lưu băm của IP thay vì IP thật. */
  async function record(action, { actor = '', detail = '', familyId = null, req: request = null } = {}) {
    try {
      await db.run('INSERT INTO audit_log(id,family_id,action,actor,detail,ip_hash) VALUES(?,?,?,?,?,?)',
        randomUUID(), familyId, action, String(actor).slice(0,254), String(detail).slice(0,500),
        request ? hash(request.ip).slice(0,32) : '');
    } catch (error) {
      // Nhật ký hỏng thì không được kéo đổ thao tác chính.
      console.error('[Cội] Không ghi được nhật ký:', error.message);
    }
  }

  app.get('/api/health', async (req,res) => res.json({ok:true}));
  app.get('/api/config', async (req,res) => res.json({demo:config.demo,mailPreview:!config.production && config.mailDriver==='preview',familyName:config.familyName,
    // Chỉ cho biết đường nào đang bật, không bao giờ lộ giá trị — màn đăng nhập
    // dùng để chọn đúng chế độ mặc định, và giúp chẩn đoán khi cấu hình thiếu.
    passwordLogin:!!config.adminPassword, emailLogin:config.mailDriver==='smtp'||config.mailDriver==='brevo', publicView:config.publicView,
    mailDriver:config.mailDriver, mailReady:config.mailDriver==='brevo'?!!(config.brevoKey&&config.brevoFrom):config.mailDriver==='smtp'?!!process.env.SMTP_HOST:true}));
  app.get('/api/invitation', async (req,res) => {
    const invite = await getInvite(req.query.token);
    if (!invite) throw new AppError(404,'Lời mời đã hết hạn hoặc không còn hiệu lực. Hãy xin link mời mới.');
    const family = await db.get('SELECT name FROM families WHERE id=?', invite.family_id);
    // The email itself is not disclosed to anyone merely holding a link.
    res.json({name:invite.name,familyName:family.name,role:invite.role});
  });
  app.post('/api/auth/request-code', async(req,res) => {
    const {email,inviteToken} = parse(z.object({email:emailSchema,inviteToken:z.string().max(128).optional()}).strict(),req.body);
    await limit(db,'otp-ip:'+hash(req.ip),15,15*60000);
    await limit(db,'otp-email:'+hash(email),5,15*60000);
    const invite = await getInvite(inviteToken);
    const user = await db.get('SELECT * FROM users WHERE email=? AND active=1', email);
    const bootstrap = email === config.adminEmail && !await db.get("SELECT id FROM families WHERE id!='demo-family'");
    const eligible = user || (invite && invite.email === email) || bootstrap;
    const id = randomUUID();
    if (eligible) {
      const code = String(randomInt(100000,1000000));
      await db.run('DELETE FROM otp_challenges WHERE email=? OR expires_at<?', email,Date.now());
      await db.run('INSERT INTO otp_challenges(id,email,code_hash,invite_hash,expires_at) VALUES(?,?,?,?,?)', id,email,otpHash(config.secret,id,code),invite?.token_hash || null,Date.now()+10*60000);
      try { await mailer.send({to:email,subject:'Mã đăng nhập Cội',text:`Mã xác nhận của bạn là ${code}.\nMã có hiệu lực 10 phút và chỉ dùng một lần.\nKhông chia sẻ mã này cho người khác.\n\nNếu bạn không yêu cầu đăng nhập, hãy bỏ qua email này.`}); }
      catch (error) {
        // Ghi lý do thật ra log: người quản lý cần biết là sai khóa, sai địa chỉ gửi
        // hay nhà cung cấp từ chối — chứ 503 trần thì không lần ra được.
        console.error('[Cội] Không gửi được mã đăng nhập:', error.message);
        await db.run('DELETE FROM otp_challenges WHERE id=?', id);
        throw new AppError(503,'Chưa gửi được mã xác nhận. Vui lòng thử lại sau.');
      }
    }
    res.json({challengeId:id,message:'Nếu email đã được mời vào dòng họ, bạn sẽ nhận được mã xác nhận.'});
  });
  app.post('/api/auth/verify', async (req,res) => {
    const {challengeId,code} = parse(z.object({challengeId:z.string().uuid(),code:z.string().regex(/^\d{6}$/)}).strict(),req.body);
    await limit(db,'verify-ip:'+hash(req.ip),30,15*60000);
    const challenge = await db.get('SELECT * FROM otp_challenges WHERE id=?', challengeId);
    if (!challenge || challenge.expires_at < Date.now() || challenge.attempts >= 5) throw new AppError(400,'Mã không hợp lệ hoặc đã hết hạn. Hãy yêu cầu mã mới.');
    await db.run('UPDATE otp_challenges SET attempts=attempts+1 WHERE id=?', challengeId);
    if (!sameHash(challenge.code_hash,otpHash(config.secret,challengeId,code))) throw new AppError(400,'Mã xác nhận chưa đúng.');
    let created=false;
    const user = await db.transaction(async tx => {
      let u = await tx.get('SELECT * FROM users WHERE email=? AND active=1', challenge.email);
      if (!u) {
        const invitation = challenge.invite_hash ? await tx.get('SELECT * FROM invitations WHERE token_hash=? AND email=? AND expires_at>? AND used_at IS NULL AND revoked_at IS NULL', challenge.invite_hash,challenge.email,Date.now()) : null;
        let familyId,role,name;
        if (invitation) {
          familyId=invitation.family_id;role=invitation.role;name=invitation.name;
          await tx.run('UPDATE invitations SET used_at=? WHERE id=?', Date.now(),invitation.id);
        } else if (challenge.email===config.adminEmail && !await tx.get("SELECT id FROM families WHERE id!='demo-family'")) {
          familyId=randomUUID();role='admin';name='Người quản lý';
          await tx.run('INSERT INTO families(id,name) VALUES(?,?)', familyId,config.familyName);
        } else throw new AppError(403,'Bạn cần một lời mời còn hiệu lực để tham gia dòng họ.');
        const oldUser = await tx.get('SELECT * FROM users WHERE email=?', challenge.email);
        if (oldUser) {
          if (oldUser.family_id!==familyId) throw new AppError(409,'Email này thuộc một dòng họ khác.');
          await tx.run('UPDATE users SET active=1,role=?,name=? WHERE id=?', role,name,oldUser.id);
          u=await tx.get('SELECT * FROM users WHERE id=?', oldUser.id);
        } else {
          const id=randomUUID();
          await tx.run('INSERT INTO users(id,family_id,email,name,role) VALUES(?,?,?,?,?)', id,familyId,challenge.email,name,role);
          u=await tx.get('SELECT * FROM users WHERE id=?', id);
          created=true;
        }
      }
      await tx.run('DELETE FROM otp_challenges WHERE email=?', challenge.email);
      return u;
    });
    if(created)await record('tai-khoan-moi',{actor:user.email,detail:`quyền ${user.role}, vào bằng mã OTP`,familyId:user.family_id,req});
    await record('dang-nhap',{actor:user.email,detail:'bằng mã OTP',familyId:user.family_id,req});
    await session(res,user);res.json({user:cleanUser(user)});
  });
  if (config.demo) app.post('/api/auth/demo', async (req,res) => {
    const {role} = parse(z.object({role:z.enum(['admin','member'])}).strict(),req.body);
    const user=await seedDemo(db,role); await session(res,user);res.json({user:cleanUser(user)});
  });
  app.post('/api/auth/password', async (req,res) => {
    const {email,password} = parse(z.object({email:emailSchema,password:z.string().min(1).max(200)}).strict(),req.body);
    await limit(db,'password-ip:'+hash(req.ip),10,15*60000);
    // So cả hai vế và chỉ trả một thông điệp, để không lộ email nào là đúng.
    const emailOk = !!config.adminEmail && sameHash(hash(email),hash(config.adminEmail));
    const passOk = !!config.adminPassword && sameHash(hash(password),hash(config.adminPassword));
    if(!emailOk||!passOk){
      await record('dang-nhap-that-bai',{actor:email,detail:'sai email hoặc mật khẩu',req});
      throw new AppError(401,'Email hoặc mật khẩu chưa đúng.');
    }
    // Đăng nhập lần đầu cũng dựng luôn dòng họ, nên không cần email để khởi tạo.
    const user = await db.transaction(async tx => {
      let owner = await tx.get("SELECT * FROM users WHERE family_id!='demo-family' AND role='admin' AND active=1 ORDER BY created_at LIMIT 1");
      if (owner) return owner;
      const familyId=randomUUID(), userId=randomUUID();
      await tx.run('INSERT INTO families(id,name) VALUES(?,?)', familyId, config.familyName);
      await tx.run("INSERT INTO users(id,family_id,email,name,role) VALUES(?,?,?,?,'admin')", userId, familyId, config.adminEmail, 'Người quản lý');
      return tx.get('SELECT * FROM users WHERE id=?', userId);
    });
    await record('dang-nhap',{actor:user.email,detail:'bằng mật khẩu quản lý',familyId:user.family_id,req});
    await session(res,user);res.json({user:cleanUser(user)});
  });
  app.post('/api/auth/logout', auth, async (req,res) => {
    await db.run('DELETE FROM sessions WHERE token_hash=?', hash(readCookie(req,'coi_session')));
    res.clearCookie('coi_session',{path:'/',httpOnly:true,secure:config.production,sameSite:'lax'});res.json({ok:true});
  });
  app.get('/api/public', async (req,res) => {
    if(!config.publicView)throw new AppError(404,'Trang này chỉ dành cho thành viên đã đăng nhập.');
    const family = await db.get("SELECT * FROM families ORDER BY CASE WHEN id='demo-family' THEN 1 ELSE 0 END, created_at LIMIT 1");
    if(!family)return res.json({family:null,ancestors:[],photos:[],memories:[],today:todayInVietnam()});
    return res.json({
      family:{name:family.name,home:family.home,observances:familyObservances(family)},
      ancestors:await livingAncestors(family.id),
      photos:await db.all('SELECT id,ancestor_id,caption,created_at FROM photos WHERE family_id=? ORDER BY created_at', family.id),
      // Chỉ ký ức đã duyệt, và chỉ tên người viết — không kèm id hay email.
      memories:await db.all("SELECT m.id,m.ancestor_id,m.body,m.created_at,u.name AS author_name,'approved' AS status FROM memories m JOIN users u ON u.id=m.author_id WHERE m.family_id=? AND m.status='approved' ORDER BY m.created_at DESC LIMIT 300", family.id),
      today:todayInVietnam(),
    });
  });
  app.get('/api/bootstrap', auth, async (req,res) => {
    const {user}=req, today=todayInVietnam();
    const family=await db.get('SELECT * FROM families WHERE id=?', user.family_id);
    const memorySql='SELECT m.id,m.ancestor_id,m.body,m.status,m.created_at,m.author_id,u.name AS author_name FROM memories m JOIN users u ON u.id=m.author_id WHERE m.family_id=?';
    res.json({user:cleanUser(user),family:{...family,observances:familyObservances(family)},
      ancestors:await livingAncestors(user.family_id),
      members:await db.all("SELECT id,name,email,role,created_at,CASE WHEN share_phone=1 THEN phone ELSE '' END AS phone FROM users WHERE family_id=? AND active=1 ORDER BY role,created_at", user.family_id),
      preferences:await preferences(user.id),subscriptions:(await db.all('SELECT ancestor_id FROM subscriptions WHERE user_id=?', user.id)).map(x=>x.ancestor_id),
      memories:user.role==='admin'
        ? await db.all(memorySql+' ORDER BY m.created_at DESC LIMIT 300', user.family_id)
        : await db.all(memorySql+" AND (m.status='approved' OR m.author_id=?) ORDER BY m.created_at DESC LIMIT 300", user.family_id,user.id),
      attendance:await db.all('SELECT a.ancestor_id,a.event_date,a.status,a.note,a.user_id,u.name AS user_name FROM attendance a JOIN users u ON u.id=a.user_id WHERE u.family_id=? AND a.event_date>=? ORDER BY a.event_date', user.family_id,today),
      photos:await db.all('SELECT id,ancestor_id,caption,bytes,created_at FROM photos WHERE family_id=? ORDER BY created_at', user.family_id),
      auditLog:user.role==='admin'?await db.all('SELECT id,action,actor,detail,created_at FROM audit_log ORDER BY created_at DESC LIMIT 100'):[],
      trash:user.role==='admin'?await db.all('SELECT id,name,generation,branch,lunar_day,lunar_month,deleted_at FROM ancestors WHERE family_id=? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 50', user.family_id):[],
      calendar:feedUrls(await calendarToken(user.id)),
      demo:user.family_id==='demo-family',today,
      invitations:user.role==='admin'?await db.all('SELECT id,email,name,role,expires_at,used_at,revoked_at FROM invitations WHERE family_id=? ORDER BY created_at DESC LIMIT 50', user.family_id):[],
      deliveries:await db.all('SELECT d.id,d.status,d.sent_at,d.attempted_at,a.name FROM mail_deliveries d JOIN ancestors a ON a.id=d.ancestor_id WHERE d.user_id=? ORDER BY d.attempted_at DESC LIMIT 20', user.id),
    });
  });
  app.patch('/api/profile',auth,async (req,res) => {
    const body=parse(profileSchema,req.body);
    await db.run('UPDATE users SET name=?,phone=?,share_phone=? WHERE id=?', body.name,body.phone,+body.share_phone,req.user.id);res.json({ok:true});
  });
  app.patch('/api/preferences',auth,async (req,res) => {
    const b=parse(preferenceSchema,req.body);await preferences(req.user.id);
    await db.run('UPDATE reminder_preferences SET enabled=?,days=?,hour=?,minute=?,all_events=? WHERE user_id=?', +b.enabled,JSON.stringify([...new Set(b.days)].sort((a,b)=>b-a)),b.hour,b.minute,+b.all_events,req.user.id);res.json({ok:true});
  });
  app.put('/api/subscriptions/:id',auth,async (req,res) => {
    await scopedAncestor(req.params.id,req.user);const {enabled}=parse(z.object({enabled:z.boolean()}).strict(),req.body);
    if(enabled)await db.run('INSERT INTO subscriptions VALUES(?,?) ON CONFLICT DO NOTHING', req.user.id,req.params.id);
    else await db.run('DELETE FROM subscriptions WHERE user_id=? AND ancestor_id=?', req.user.id,req.params.id);
    res.json({ok:true});
  });
  async function validateParent(body,user,currentId) {
    if (!body.parent_id) return;
    if(body.parent_id===currentId)throw new AppError(400,'Một người không thể là cha/mẹ của chính mình.');
    const parent=await scopedAncestor(body.parent_id,user);
    if(parent.generation>=body.generation)throw new AppError(400,'Người thuộc thế hệ trước phải có số đời nhỏ hơn.');
  }
  async function validateSpouse(body,user,currentId) {
    if (!body.spouse_id) return;
    if(body.spouse_id===currentId)throw new AppError(400,'Một người không thể là vợ/chồng của chính mình.');
    if(body.spouse_id===body.parent_id)throw new AppError(400,'Một người không thể vừa là cha/mẹ vừa là vợ/chồng.');
    await scopedAncestor(body.spouse_id,user);
  }
  /** A marriage reads the same from both sides, so the back-link is written here and
   * whoever either side was previously paired with is released. */
  async function syncSpouse(personId,previous,next,familyId) {
    if (previous===next) return;
    if (previous) await db.run('UPDATE ancestors SET spouse_id=NULL,revision=revision+1 WHERE id=? AND family_id=? AND spouse_id=?', previous,familyId,personId);
    if (next) {
      const theirs=(await db.get('SELECT spouse_id FROM ancestors WHERE id=? AND family_id=?', next,familyId))?.spouse_id;
      if(theirs&&theirs!==personId)await db.run('UPDATE ancestors SET spouse_id=NULL,revision=revision+1 WHERE id=? AND family_id=?', theirs,familyId);
      await db.run('UPDATE ancestors SET spouse_id=?,revision=revision+1 WHERE id=? AND family_id=?', personId,next,familyId);
    }
  }
  app.post('/api/ancestors',auth,admin,async (req,res) => {
    const b=parse(ancestorSchema,req.body);await validateParent(b,req.user);await validateSpouse(b,req.user);const id=randomUUID();
    const cols=Object.keys(b);
    await db.transaction(async tx => {
      await tx.run(`INSERT INTO ancestors(id,family_id,created_by,${cols.join(',')}) VALUES(${Array(cols.length+3).fill('?').join(',')})`, id,req.user.family_id,req.user.id,...Object.values(b));
      await syncSpouse(id,null,b.spouse_id,req.user.family_id);
    });
    res.status(201).json({id});
  });
  app.put('/api/ancestors/:id',auth,admin,async (req,res) => {
    const before=await scopedAncestor(req.params.id,req.user);
    const b=parse(ancestorSchema,req.body);await validateParent(b,req.user,req.params.id);await validateSpouse(b,req.user,req.params.id);
    const child=await db.get('SELECT generation FROM ancestors WHERE parent_id=? AND deleted_at IS NULL ORDER BY generation LIMIT 1', req.params.id);
    if(child&&child.generation<=b.generation)throw new AppError(400,'Số đời phải nhỏ hơn số đời của thế hệ con đã liên kết.');
    await db.transaction(async tx => {
      await tx.run(`UPDATE ancestors SET ${Object.keys(b).map(x=>x+'=?').join(',')},revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND family_id=?`, ...Object.values(b),req.params.id,req.user.family_id);
      await syncSpouse(req.params.id,before.spouse_id,b.spouse_id,req.user.family_id);
    });
    res.json({ok:true});
  });
  // Removing a person hides a lifetime of memories, so it is reversible from the trash.
  app.delete('/api/ancestors/:id',auth,admin,async (req,res) => {
    await scopedAncestor(req.params.id,req.user);
    await db.run('UPDATE ancestors SET deleted_at=?,revision=revision+1 WHERE id=? AND family_id=?', Date.now(),req.params.id,req.user.family_id);res.json({ok:true});
  });
  app.post('/api/ancestors/:id/restore',auth,admin,async (req,res) => {
    const result=await db.run('UPDATE ancestors SET deleted_at=NULL,revision=revision+1 WHERE id=? AND family_id=? AND deleted_at IS NOT NULL', req.params.id,req.user.family_id);
    if(!result.changes)throw new AppError(404,'Không tìm thấy bản ghi trong thùng rác.');res.json({ok:true});
  });
  app.delete('/api/trash/:id',auth,admin,async (req,res) => {
    const person=await db.get('SELECT * FROM ancestors WHERE id=? AND family_id=? AND deleted_at IS NOT NULL', req.params.id,req.user.family_id);
    if(!person)throw new AppError(404,'Không tìm thấy bản ghi trong thùng rác.');
    const photos=await db.all('SELECT * FROM photos WHERE ancestor_id=?', person.id);
    await db.run('DELETE FROM ancestors WHERE id=?', person.id);
    for(const photo of photos)await store.remove(photo);
    res.json({ok:true});
  });
  const PHOTO_LIMIT=40;
  app.post('/api/ancestors/:id/photos',auth,admin,async (req,res) => {
    const person=await scopedAncestor(req.params.id,req.user);
    const body=parse(photoSchema,req.body);
    const {n}=await db.get('SELECT count(*) AS n FROM photos WHERE ancestor_id=?', person.id);
    if(n>=PHOTO_LIMIT)throw new AppError(409,`Mỗi người thân giữ tối đa ${PHOTO_LIMIT} ảnh. Hãy xóa bớt trước khi thêm.`);
    const {mime,bytes}=decodeImage(body.data);
    const id=randomUUID();
    const url=await store.write(id,mime,bytes);
    await db.transaction(async tx => {
      await tx.run('INSERT INTO photos(id,family_id,ancestor_id,mime,bytes,caption,url,created_by) VALUES(?,?,?,?,?,?,?,?)', id,req.user.family_id,person.id,mime,bytes.length,body.caption,url,req.user.id);
      // The first photo of a person becomes the face shown everywhere else.
      if(!person.photo_id)await tx.run('UPDATE ancestors SET photo_id=? WHERE id=?', id,person.id);
      await tx.run('UPDATE ancestors SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=?', person.id);
    });
    res.status(201).json({id,portrait:!person.photo_id});
  });
  app.put('/api/ancestors/:id/portrait',auth,admin,async (req,res) => {
    const person=await scopedAncestor(req.params.id,req.user);
    const {photo_id}=parse(z.object({photo_id:z.string().uuid().nullable()}).strict(),req.body);
    if(photo_id&&!await db.get('SELECT id FROM photos WHERE id=? AND ancestor_id=?', photo_id,person.id))throw new AppError(404,'Ảnh này không thuộc về người thân đã chọn.');
    await db.run('UPDATE ancestors SET photo_id=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=?', photo_id,person.id);
    res.json({ok:true});
  });
  app.patch('/api/photos/:id',auth,admin,async (req,res) => {
    const {caption}=parse(z.object({caption:z.string().trim().max(200)}).strict(),req.body);
    const result=await db.run('UPDATE photos SET caption=? WHERE id=? AND family_id=?', caption,req.params.id,req.user.family_id);
    if(!result.changes)throw new AppError(404,'Không tìm thấy ảnh.');res.json({ok:true});
  });
  app.delete('/api/photos/:id',auth,admin,async (req,res) => {
    const photo=await db.get('SELECT * FROM photos WHERE id=? AND family_id=?', req.params.id,req.user.family_id);
    if(!photo)throw new AppError(404,'Không tìm thấy ảnh.');
    await db.transaction(async tx => {
      await tx.run('DELETE FROM photos WHERE id=?', photo.id);
      // ON DELETE SET NULL already cleared the portrait; fall back to another photo.
      const next=await tx.get('SELECT id FROM photos WHERE ancestor_id=? ORDER BY created_at LIMIT 1', photo.ancestor_id);
      await tx.run('UPDATE ancestors SET photo_id=COALESCE(photo_id,?),revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=?', next?.id||null,photo.ancestor_id);
    });
    await store.remove(photo);
    res.json({ok:true});
  });
  // Xác thực tùy chọn: có phiên thì vẫn nhận ra người dùng để giữ phạm vi dòng họ,
  // không có phiên thì vẫn cho xem khi dòng họ đã mở công khai.
  const photoViewer = async (req,res,next) => {
    const raw = readCookie(req,'coi_session');
    if (raw) req.user = await db.get('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1', hash(raw),Date.now());
    if (!req.user && !config.publicView) return next(new AppError(401,'Phiên đăng nhập đã hết. Vui lòng đăng nhập lại.'));
    next();
  };
  app.get('/api/photos/:id',photoViewer,async (req,res) => {
    const photo = req.user
      ? await db.get('SELECT * FROM photos WHERE id=? AND family_id=?', req.params.id,req.user.family_id)
      : await db.get('SELECT * FROM photos WHERE id=?', req.params.id);
    if(!photo)throw new AppError(404,'Không tìm thấy ảnh.');
    let bytes; try { bytes=await store.read(photo); }
    catch { throw new AppError(404,'Không còn tìm thấy tệp ảnh. Hãy tải lại ảnh.'); }
    res.type(photo.mime).set('Cache-Control','private, max-age=31536000, immutable').send(bytes);
  });
  app.post('/api/ancestors/:id/memories',auth,async (req,res) => {
    const person=await scopedAncestor(req.params.id,req.user);
    const b=parse(memorySchema,req.body);
    await limit(db,'memory:'+req.user.id,20,3600000);
    const id=randomUUID(),status=req.user.role==='admin'?'approved':'pending';
    await db.run('INSERT INTO memories(id,family_id,ancestor_id,author_id,body,status,reviewed_by,reviewed_at) VALUES(?,?,?,?,?,?,?,?)',
      id,req.user.family_id,person.id,req.user.id,b.body,status,status==='approved'?req.user.id:null,status==='approved'?Date.now():null);
    res.status(201).json({id,status});
  });
  app.patch('/api/memories/:id',auth,admin,async (req,res) => {
    const b=parse(z.object({status:z.enum(['approved','rejected'])}).strict(),req.body);
    const result=await db.run('UPDATE memories SET status=?,reviewed_by=?,reviewed_at=? WHERE id=? AND family_id=?', b.status,req.user.id,Date.now(),req.params.id,req.user.family_id);
    if(!result.changes)throw new AppError(404,'Không tìm thấy ký ức này.');res.json({ok:true});
  });
  app.delete('/api/memories/:id',auth,async (req,res) => {
    const row=await db.get('SELECT * FROM memories WHERE id=? AND family_id=?', req.params.id,req.user.family_id);
    if(!row)throw new AppError(404,'Không tìm thấy ký ức này.');
    if(req.user.role!=='admin'&&row.author_id!==req.user.id)throw new AppError(403,'Bạn chỉ xóa được ký ức do mình gửi.');
    await db.run('DELETE FROM memories WHERE id=?', row.id);res.json({ok:true});
  });
  app.put('/api/attendance/:id',auth,async (req,res) => {
    const person=await scopedAncestor(req.params.id,req.user);
    const b=parse(attendanceSchema,req.body),today=todayInVietnam();
    if(b.event_date<today)throw new AppError(400,'Chỉ ghi nhận cho ngày giỗ sắp tới.');
    if(!occurrences([person],today,addDays(today,400)).some(e=>e.date===b.event_date))throw new AppError(400,'Ngày này không phải ngày giỗ của người thân đã chọn.');
    await db.run('INSERT INTO attendance(user_id,ancestor_id,event_date,status,note,updated_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id,ancestor_id,event_date) DO UPDATE SET status=excluded.status,note=excluded.note,updated_at=CURRENT_TIMESTAMP',
      req.user.id,person.id,b.event_date,b.status,b.note);
    res.json({ok:true});
  });
  app.patch('/api/family',auth,admin,async (req,res) => {
    const b=parse(familySchema,req.body);
    await db.run('UPDATE families SET name=?,home=?,observances=? WHERE id=?', b.name,b.home,JSON.stringify([...new Set(b.observances)]),req.user.family_id);res.json({ok:true});
  });
  app.post('/api/invitations',auth,admin,async (req,res) => {
    const b=parse(inviteSchema,req.body);await limit(db,'invite:'+req.user.id,30,3600000);
    if(await db.get('SELECT id FROM users WHERE email=? AND active=1', b.email))throw new AppError(409,'Email này đã có tài khoản đang hoạt động.');
    const raw=token(),id=randomUUID(),expiresAt=Date.now()+7*86400000;
    await db.transaction(async tx => {
      await tx.run('UPDATE invitations SET revoked_at=? WHERE email=? AND family_id=? AND used_at IS NULL', Date.now(),b.email,req.user.family_id);
      await tx.run('INSERT INTO invitations(id,family_id,email,name,role,token_hash,created_by,expires_at) VALUES(?,?,?,?,?,?,?,?)', id,req.user.family_id,b.email,b.name,b.role,hash(raw),req.user.id,expiresAt);
    });
    const url=new URL(config.appUrl);url.searchParams.set('invite',raw);
    await record('moi-thanh-vien',{actor:req.user.email,detail:`mời ${b.email} với quyền ${b.role}`,familyId:req.user.family_id,req});
    // The invitation is copied by the administrator; no unsolicited email is sent.
    res.status(201).json({id,url:url.toString(),expiresAt});
  });
  app.delete('/api/invitations/:id',auth,admin,async (req,res) => {
    const result=await db.run('UPDATE invitations SET revoked_at=? WHERE id=? AND family_id=? AND used_at IS NULL', Date.now(),req.params.id,req.user.family_id);
    if(!result.changes)throw new AppError(404,'Không tìm thấy lời mời còn hiệu lực.');res.json({ok:true});
  });
  app.patch('/api/members/:id',auth,admin,async (req,res) => {
    const b=parse(z.object({role:z.enum(['admin','member']).optional(),active:z.boolean().optional()}).strict().refine(x=>Object.keys(x).length>0),req.body);
    const member=await db.get('SELECT * FROM users WHERE id=? AND family_id=? AND active=1', req.params.id,req.user.family_id);
    if(!member)throw new AppError(404,'Không tìm thấy thành viên.');
    if(b.active===false&&member.id===req.user.id)throw new AppError(400,'Bạn không thể tự thu hồi quyền truy cập của mình.');
    if(member.role==='admin'&&(b.role==='member'||b.active===false)) {
      const {n}=await db.get("SELECT count(*) AS n FROM users WHERE family_id=? AND active=1 AND role='admin'", req.user.family_id);
      if(n<=1)throw new AppError(400,'Dòng họ cần ít nhất một người quản lý.');
    }
    await db.run('UPDATE users SET role=?,active=? WHERE id=?', b.role||member.role,b.active===undefined?1:+b.active,member.id);
    if(b.active===false)await db.run('DELETE FROM sessions WHERE user_id=?', member.id);
    await record(b.active===false?'thu-hoi-truy-cap':'doi-quyen',{actor:req.user.email,detail:`${member.email}${b.role?' → '+b.role:''}`,familyId:req.user.family_id,req});
    res.json({ok:true});
  });
  async function calendarFor(user) {
    const family=await db.get('SELECT * FROM families WHERE id=?', user.family_id);
    const from=todayInVietnam();
    return buildCalendar({familyName:family.name,ancestors:await livingAncestors(user.family_id),
      observanceKeys:familyObservances(family),from,to:addDays(from,FEED_DAYS),reminder:await preferences(user.id)});
  }
  // Subscribing clients poll without a session, so the path token is the credential.
  app.get('/api/calendar/:token/lich-ngay-gio.ics',async (req,res) => {
    await limit(db,'feed-ip:'+hash(req.ip),300,3600000);
    if(!/^[a-f0-9]{64}$/.test(req.params.token))throw new AppError(404,'Link lịch không còn hiệu lực.');
    const owner=await db.get('SELECT u.* FROM calendar_tokens c JOIN users u ON u.id=c.user_id WHERE c.token=? AND u.active=1', req.params.token);
    if(!owner)throw new AppError(404,'Link lịch không còn hiệu lực. Hãy mở Cội và tạo link mới.');
    res.type('text/calendar').set('Cache-Control','private, max-age=3600').send(await calendarFor(owner));
  });
  app.get('/api/calendar.ics',auth,async (req,res) => {
    res.type('text/calendar').set('Content-Disposition','attachment; filename="coi-lich-ngay-gio.ics"').send(await calendarFor(req.user));
  });
  app.post('/api/calendar-token',auth,async (req,res) => {
    const value=token();
    await db.run('INSERT INTO calendar_tokens(user_id,token) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET token=excluded.token,created_at=CURRENT_TIMESTAMP', req.user.id,value);
    res.json(feedUrls(value));
  });
  app.get('/api/calendar-qr.svg',auth,async (req,res) => {
    const qr=qrcode(0,'M');qr.addData(feedUrls(await calendarToken(req.user.id)).webcal);qr.make();
    res.type('image/svg+xml').send(qr.createSvgTag({cellSize:4,margin:2,scalable:true}));
  });
  app.get('/api/export.json',auth,admin,async (req,res) => {
    const family=await db.get('SELECT * FROM families WHERE id=?', req.user.family_id);
    res.type('application/json').set('Content-Disposition','attachment; filename="coi-du-lieu-dong-ho.json"').send(JSON.stringify({
      exportedAt:new Date().toISOString(),
      note:'Ảnh chân dung được lưu thành tệp trong UPLOAD_DIR và nằm trong bản sao lưu của npm run backup, không nằm trong tệp này.',
      family:{...family,observances:familyObservances(family)},
      members:await db.all('SELECT id,name,email,role,phone,share_phone,active,created_at FROM users WHERE family_id=?', req.user.family_id),
      ancestors:await db.all('SELECT * FROM ancestors WHERE family_id=?', req.user.family_id),
      memories:await db.all('SELECT m.*,u.email AS author_email FROM memories m JOIN users u ON u.id=m.author_id WHERE m.family_id=?', req.user.family_id),
      attendance:await db.all('SELECT a.* FROM attendance a JOIN users u ON u.id=a.user_id WHERE u.family_id=?', req.user.family_id),
    },null,2));
  });
  // On Vercel there is no process to hold a 60-second timer, so Cron calls this instead.
  app.get('/api/cron/reminders', async (req,res) => {
    if(!config.cronSecret||req.headers.authorization!==`Bearer ${config.cronSecret}`)throw new AppError(401,'Không có quyền chạy tác vụ định kỳ.');
    res.json(await runReminders({db,mailer,config}));
  });
  app.use('/api',(req,res,next)=>next(new AppError(404,'Không tìm thấy chức năng này.')));
  const dist=resolve('dist');
  if(existsSync(resolve(dist,'index.html'))) {
    app.use(express.static(dist,{index:false}));
    app.get('/{*path}',async (req,res)=>res.sendFile(resolve(dist,'index.html')));
  }
  app.use((error,req,res,next)=>{
    const status=error.status||(error.type==='entity.parse.failed'?400:error.type==='entity.too.large'?413:500);
    // Outside production the message is worth seeing; production keeps it out of the log.
    if(status>=500)console.error('[Cội] Request failed:',config.production?error.name:error);
    res.status(status).json({error:status<500?error.message:'Cội chưa xử lý được yêu cầu. Vui lòng thử lại sau.'});
  });
  return {app,db,mailer};
}
