import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

export function getConfig(overrides = {}) {
  // Đừng chỉ tin NODE_ENV: Vercel tự đặt biến này, và nếu ai đó khai đè hoặc xóa nhầm
  // thì app sẽ tưởng mình đang chạy local — bỏ qua mọi kiểm tra và có thể bật dữ liệu mẫu
  // ngay trên bản chạy thật. VERCEL_ENV do nền tảng đặt, không sửa được từ danh sách biến.
  const production = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
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
    brevoKey: process.env.BREVO_API_KEY || '',
    brevoFrom: (process.env.BREVO_TU_EMAIL || '').trim(),
    brevoName: process.env.BREVO_TU_TEN || process.env.FAMILY_NAME || 'Cội',
    remindersEnabled: process.env.REMINDERS_ENABLED === 'true',
    trustProxy: process.env.TRUST_PROXY === 'true',
    // Vercel Cron signs its call with this; without it the endpoint stays shut.
    cronSecret: process.env.CRON_SECRET || '',
    // Mật khẩu quản lý: cách vào không cần email. Rỗng thì chỉ còn đăng nhập bằng OTP.
    adminPassword: process.env.ADMIN_PASSWORD || '',
    // Khách chưa đăng nhập xem được phần tưởng nhớ; người còn sống vẫn cần đăng nhập.
    publicView: process.env.PUBLIC_VIEW !== 'false',
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
    // Phải còn ít nhất một đường vào: mật khẩu quản lý, hoặc OTP qua SMTP.
    const canMail = config.mailDriver === 'smtp' || config.mailDriver === 'brevo';
    if (!config.adminPassword && !canMail) throw new Error('Cần ADMIN_PASSWORD, hoặc MAIL_DRIVER=smtp/brevo để gửi mã đăng nhập.');
    if (config.mailDriver === 'brevo' && (!config.brevoKey || !config.brevoFrom)) throw new Error('MAIL_DRIVER=brevo cần cả BREVO_API_KEY và BREVO_TU_EMAIL (địa chỉ gửi đã xác minh trong Brevo).');
    if (config.adminPassword && config.adminPassword.length < 8) throw new Error('ADMIN_PASSWORD phải có ít nhất 8 ký tự.');
    if (!config.adminEmail) throw new Error('Cần khai báo ADMIN_EMAIL trước khi mở hệ thống.');
  }
  return config;
}
