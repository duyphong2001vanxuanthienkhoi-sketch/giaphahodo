import { z } from 'zod';
import { AppError } from './security.js';
import { OBSERVANCES } from '../shared/lunar.js';
export function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) throw new AppError(400, result.error.issues.map(x => `${x.path.join('.')}: ${x.message}`).join('; '));
  return result.data;
}
const text = (max = 200) => z.string().trim().max(max);
export const emailSchema = z.string().trim().toLowerCase().email().max(254);
const year = z.number().int().min(1000).max(2199).nullable();
export const REMINDER_DAYS = [0,1,3,7,14,30];
export const ancestorSchema = z.object({
  name: text(120).min(2), generation: z.number().int().min(1).max(30), branch: text(80).min(1),
  birth_year: year, death_year: year, parent_id: z.string().uuid().nullable(), spouse_id: z.string().uuid().nullable(),
  lunar_day: z.number().int().min(1).max(30), lunar_month: z.number().int().min(1).max(12),
  leap_policy: z.enum(['regular','prefer-leap','both']), short_month_policy: z.enum(['last-day','skip']),
  location: text(300), biography: text(5000), note: text(2000),
  // Cả SQLite lẫn Postgres đều không nhận boolean cho cột INTEGER, nên ép ngay tại đây.
  living: z.boolean().transform(v => v ? 1 : 0), birth_date: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, 'Ngày sinh phải có dạng YYYY-MM-DD.'), phone: text(25),
  birth_order: z.number().int().min(0).max(30),   // con cả là 1; 0 là chưa biết
}).strict().refine(v => !v.birth_year || !v.death_year || v.birth_year <= v.death_year, {message:'Năm mất phải sau hoặc bằng năm sinh.'});
export const preferenceSchema = z.object({
  enabled: z.boolean(), days: z.array(z.number().int().refine(d=>REMINDER_DAYS.includes(d),{message:'Mốc nhắc không hợp lệ.'})).max(REMINDER_DAYS.length),
  hour: z.number().int().min(0).max(23), minute: z.number().int().min(0).max(59), all_events: z.boolean(),
}).strict().refine(v => !v.enabled || v.days.length > 0, {message:'Hãy chọn ít nhất một thời điểm nhắc.'});
export const profileSchema = z.object({ name:text(80).min(2), phone:text(25), share_phone:z.boolean() }).strict();
export const inviteSchema = z.object({email:emailSchema,name:text(80).min(2),role:z.enum(['admin','member'])}).strict();
export const familySchema = z.object({
  name: z.string().trim().min(2).max(100), home: text(300),
  observances: z.array(z.enum(OBSERVANCES.map(o=>o.key))).max(OBSERVANCES.length),
}).strict();
export const memorySchema = z.object({ body: text(4000).min(10) }).strict();
export const attendanceSchema = z.object({
  status: z.enum(['yes','maybe','no']), note: text(200),
  event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).strict();
export const photoSchema = z.object({ data: z.string().max(6_000_000), caption: text(200).default('') }).strict();

export const registerSchema = z.object({
  name: text(80).min(2), email: emailSchema,
  password: z.string().min(8, 'Mật khẩu phải có ít nhất 8 ký tự.').max(200),
}).strict();
