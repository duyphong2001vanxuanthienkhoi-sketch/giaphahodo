import 'dotenv/config';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync, cpSync, readdirSync } from 'node:fs';
import { resolve, basename, join } from 'node:path';

const source=resolve(process.env.DATABASE_PATH||'./data/coi.sqlite');
const uploads=resolve(process.env.UPLOAD_DIR||'./data/uploads');
const folder=resolve(process.env.BACKUP_DIR||'./backups');
mkdirSync(folder,{recursive:true});
const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
const name=`${basename(source,'.sqlite')}-${stamp}`;
const destination=join(folder,`${name}.sqlite`);
const quote=path=>`'${path.replaceAll("'","''")}'`;
const db=new DatabaseSync(source,{readOnly:true});
try { db.exec(`VACUUM INTO ${quote(destination)}`); console.log(`Đã sao lưu dữ liệu vào ${destination}`); }
finally { db.close(); }
// Portraits live on disk, not in SQLite. A database-only backup would silently lose them.
if (existsSync(uploads)) {
  const target=join(folder,`${name}-uploads`);
  cpSync(uploads,target,{recursive:true});
  console.log(`Đã sao lưu ${readdirSync(target).length} tệp ảnh vào ${target}`);
} else {
  console.log('Chưa có thư mục ảnh để sao lưu.');
}
