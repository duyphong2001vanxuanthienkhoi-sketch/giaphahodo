import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
export const hash = value => createHash('sha256').update(String(value)).digest('hex');
export const token = () => randomBytes(32).toString('hex');
export const otpHash = (secret, id, code) => createHmac('sha256', secret).update(id + ':' + code).digest('hex');
export function sameHash(a, b) {
  const aa = Buffer.from(a || '', 'hex'), bb = Buffer.from(b || '', 'hex');
  return aa.length === bb.length && aa.length > 0 && timingSafeEqual(aa, bb);
}
export class AppError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export async function limit(db, scope, maximum, windowMs, now = Date.now()) {
  await db.run('DELETE FROM rate_limits WHERE reset_at < ?', now);
  const row = await db.get('SELECT * FROM rate_limits WHERE scope=?', scope);
  if (row && row.count >= maximum) throw new AppError(429, 'Bạn đã thử nhiều lần. Vui lòng đợi một lúc rồi thử lại.');
  await db.run('INSERT INTO rate_limits(scope,count,reset_at) VALUES(?,1,?) ON CONFLICT(scope) DO UPDATE SET count=rate_limits.count+1', scope, now + windowMs);
}
export function readCookie(req, name) {
  return (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(name + '='))?.slice(name.length + 1);
}
