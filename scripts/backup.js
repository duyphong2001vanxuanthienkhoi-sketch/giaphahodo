import 'dotenv/config';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync, cpSync, readdirSync } from 'node:fs';
import { resolve, basename, join } from 'node:path';
import { isPostgres } from '../server/db.js';

const source = resolve(process.env.DATABASE_PATH || './data/coi.sqlite');
const uploads = resolve(process.env.UPLOAD_DIR || './data/uploads');
const folder = resolve(process.env.BACKUP_DIR || './backups');
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

if (isPostgres(process.env.DATABASE_URL)) {
  // Nothing to copy locally: the data lives in the managed database, not in this folder.
  console.log('Cội đang chạy trên Postgres, không có tệp cơ sở dữ liệu để sao lưu tại đây.');
  console.log('Hãy sao lưu bằng công cụ của nhà cung cấp:');
  console.log('  • Neon: dùng Branches để tạo nhánh ảnh chụp, hoặc pg_dump nếu muốn tệp rời.');
  console.log('  • pg_dump "$DATABASE_URL" > coi-' + stamp + '.sql');
  if (process.env.BLOB_READ_WRITE_TOKEN) console.log('Ảnh nằm trong Vercel Blob và được nhà cung cấp lưu giữ, không nằm ở máy này.');
  console.log('\nBản xuất JSON trong Tài khoản → Dữ liệu & thùng rác vẫn tải được bất cứ lúc nào.');
  process.exit(0);
}

mkdirSync(folder, { recursive: true });
const name = `${basename(source, '.sqlite')}-${stamp}`;
const destination = join(folder, `${name}.sqlite`);
const quote = path => `'${path.replaceAll("'", "''")}'`;
const db = new DatabaseSync(source, { readOnly: true });
try { db.exec(`VACUUM INTO ${quote(destination)}`); console.log(`Đã sao lưu dữ liệu vào ${destination}`); }
finally { db.close(); }
// Portraits live on disk, not in SQLite. A database-only backup would silently lose them.
if (existsSync(uploads)) {
  const target = join(folder, `${name}-uploads`);
  cpSync(uploads, target, { recursive: true });
  console.log(`Đã sao lưu ${readdirSync(target).length} tệp ảnh vào ${target}`);
} else {
  console.log('Chưa có thư mục ảnh để sao lưu.');
}
