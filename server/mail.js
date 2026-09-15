import nodemailer from 'nodemailer';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';

/** Brevo gửi qua HTTPS nên không cần cổng SMTP hay App Password, và chạy được ở
 * môi trường serverless nơi kết nối SMTP hay bị chặn. Gói miễn phí 300 thư/ngày,
 * chỉ cần xác minh một địa chỉ người gửi chứ không cần sở hữu tên miền. */
function brevoMailer(config) {
  return {
    async send({ to, subject, text }) {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': config.brevoKey, 'content-type': 'application/json' },
        body: JSON.stringify({
          sender: { name: config.brevoName, email: config.brevoFrom },
          to: [{ email: to }],
          subject,
          textContent: text,
        }),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`Brevo trả về ${response.status}: ${detail.slice(0, 200)}`);
      }
      return { brevo: true };
    },
  };
}

export function createMailer(config) {
  if (config.mailDriver === 'brevo') return brevoMailer(config);
  const preview = config.mailDriver === 'preview';
  const transport = nodemailer.createTransport(preview ? { streamTransport: true, buffer: true, newline: 'unix' } : {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    requireTLS: process.env.SMTP_SECURE !== 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 15000, socketTimeout: 30000,
  });
  return {
    async send({ to, subject, text, id }) {
      const info = await transport.sendMail({
        from: process.env.MAIL_FROM || 'Cội <no-reply@example.com>', to, subject, text,
        messageId: id ? `<${id}@${new URL(config.appUrl).hostname}>` : undefined,
        disableFileAccess: true, disableUrlAccess: true,
      });
      if (preview) {
        // In ra console trước: cách này chạy ở mọi nơi, kể cả nền serverless nơi đĩa
        // chỉ đọc được. Mã OTP nằm ngay trong thân thư nên đăng nhập thử được luôn.
        console.log('\n──────── EMAIL (chế độ xem trước, KHÔNG gửi thật) ────────');
        console.log('Tới     :', to);
        console.log('Tiêu đề :', subject);
        console.log(String(text || '').trim());
        console.log('──────────────────────────────────────────────────────────\n');
        // Ghi thêm ra tệp .eml khi đĩa cho phép; hỏng thì bỏ qua, đã có bản in trên.
        try {
          const folder = join(dirname(config.dbPath), 'mail');
          await mkdir(folder, { recursive: true });
          await writeFile(join(folder, `${Date.now()}-${randomUUID()}.eml`), info.message, { mode: 0o600 });
        } catch (error) {
          console.log('(không ghi được tệp .eml:', error.code || error.message, '— chỉ in ra console)');
        }
      }
      return { preview };
    },
  };
}
