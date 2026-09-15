import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

export function getConfig(overrides = {}) {
  const production = process.env.NODE_ENV === 'production';
  const config = {
    production,
    port: Number(process.env.PORT || 3001),
    appUrl: process.env.APP_URL || 'http://localhost:5173',
    // Set DATABASE_URL to run on Postgres/Neon; otherwise Cội uses the SQLite file.
    databaseUrl: process.env.DATABASE_URL || '',
    dbPath: resolve(process.env.DATABASE_PATH || './data/coi.sqlite'),
    uploadDir: resolve(process.env.UPLOAD_DIR || './data/uploads'),
    // Present on Vercel; when set, photos go to Blob storage instead of the local disk.
    blobToken: process.env.BLOB_READ_WRITE_TOKEN || '',
    secret: process.env.APP_SECRET || (production ? '' : randomBytes(32).toString('hex')),
    adminEmail: (process.env.ADMIN_EMAIL || '').trim().toLowerCase(),
    familyName: process.env.FAMILY_NAME || 'Dòng họ Đỗ',
    demo: !production && process.env.DEMO_MODE !== 'false',
    mailDriver: process.env.MAIL_DRIVER || 'preview',
    remindersEnabled: process.env.REMINDERS_ENABLED === 'true',
    trustProxy: process.env.TRUST_PROXY === 'true',
    // Vercel Cron signs its call with this; without it the endpoint stays shut.
    cronSecret: process.env.CRON_SECRET || '',
    ...overrides,
  };
  // Vercel gives the function a read-only filesystem, so the SQLite fallback cannot
  // work there. Say so plainly instead of failing later with mkdir ENOENT.
  if (process.env.VERCEL && !config.databaseUrl) {
    throw new Error('Trên Vercel bắt buộc khai DATABASE_URL: đĩa của hàm chỉ đọc được nên không dùng SQLite được.');
  }
  if (config.production) {
    if (config.secret.length < 32) throw new Error(`APP_SECRET phải có ít nhất 32 ký tự (máy chủ đang đọc được ${config.secret.length}).`);
    if (!config.appUrl.startsWith('https://')) throw new Error('APP_URL phải dùng HTTPS khi chạy production.');
    if (config.demo) throw new Error('Không bật tài khoản dùng thử trong production.');
    if (config.mailDriver !== 'smtp') throw new Error('Cần MAIL_DRIVER=smtp để gửi mã đăng nhập thật.');
    if (!config.adminEmail) throw new Error('Cần khai báo ADMIN_EMAIL trước khi mở hệ thống.');
  }
  return config;
}
