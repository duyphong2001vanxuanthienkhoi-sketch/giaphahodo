import 'dotenv/config';
import { getConfig } from '../server/config.js';
import { openDatabase } from '../server/db.js';

/** Xóa dữ liệu mẫu và dữ liệu do bộ test để lại, giữ nguyên dòng họ thật.
 *
 * Chạy để xem trước, không xóa gì:      npm run don-test
 * Chạy để xóa thật:                     npm run don-test -- --xoa-that
 *
 * Hai dòng họ bị xóa là "demo-family" (dữ liệu mẫu của server/seed.js) và "real-test"
 * (do tests/api.test.js dựng lên). Kèm theo là mọi tài khoản @example.test còn sót ở
 * dòng họ thật. Bảng families không có ON DELETE CASCADE nên phải xóa từ lá vào gốc. */

const REAL_DELETE = process.argv.includes('--xoa-that');
const JUNK_FAMILIES = ['demo-family', 'real-test'];
const TEST_EMAIL = '%@example.test';

const config = getConfig();
const db = await openDatabase(config.databaseUrl || config.dbPath);
try {
  const families = await db.all('SELECT id,name FROM families');
  const junk = families.filter(f => JUNK_FAMILIES.includes(f.id));
  const keep = families.filter(f => !JUNK_FAMILIES.includes(f.id));

  console.log('Sẽ GIỮ LẠI:');
  for (const f of keep) {
    const people = await db.get('SELECT COUNT(*) AS n FROM ancestors WHERE family_id=?', f.id);
    const users = await db.get('SELECT COUNT(*) AS n FROM users WHERE family_id=?', f.id);
    console.log(`  ${f.name} — ${people.n} người, ${users.n} tài khoản`);
  }
  if (!keep.length) console.log('  (không có dòng họ nào — dừng lại cho chắc)');

  console.log('\nSẽ XÓA:');
  for (const f of junk) {
    const people = await db.all('SELECT name FROM ancestors WHERE family_id=?', f.id);
    const users = await db.all('SELECT email FROM users WHERE family_id=?', f.id);
    console.log(`  Dòng họ "${f.name}" (${f.id})`);
    if (people.length) console.log(`    người: ${people.map(p => p.name).join(', ')}`);
    if (users.length) console.log(`    tài khoản: ${users.map(u => u.email).join(', ')}`);
  }
  const strays = await db.all('SELECT email,name,family_id FROM users WHERE email LIKE ? AND family_id NOT IN (' + JUNK_FAMILIES.map(() => '?').join(',') + ')', TEST_EMAIL, ...JUNK_FAMILIES);
  for (const u of strays) console.log(`  Tài khoản test lạc sang dòng họ thật: ${u.email} (${u.name})`);
  if (!junk.length && !strays.length) { console.log('  (không còn gì để xóa)'); process.exit(0); }

  if (!keep.length) {
    console.error('\nDừng lại: không tìm thấy dòng họ thật nào để giữ. Kiểm tra lại DATABASE_URL.');
    process.exit(1);
  }
  if (!REAL_DELETE) {
    console.log('\nMới chỉ xem trước, chưa xóa gì. Chạy lại kèm --xoa-that để xóa thật:');
    console.log('  npm run don-test -- --xoa-that');
    process.exit(0);
  }

  const marks = JUNK_FAMILIES.map(() => '?').join(',');
  await db.transaction(async tx => {
    const step = async (label, sql, ...params) => {
      const { changes } = await tx.run(sql, ...params);
      console.log(`  ${label.padEnd(32)} ${changes}`);
    };
    console.log('\nĐang xóa:');
    // ancestors.photo_id trỏ sang photos, nên gỡ ảnh khỏi người trước khi xóa ảnh.
    await step('gỡ ảnh khỏi người', `UPDATE ancestors SET photo_id=NULL WHERE family_id IN (${marks})`, ...JUNK_FAMILIES);
    await step('xóa ký ức', `DELETE FROM memories WHERE family_id IN (${marks})`, ...JUNK_FAMILIES);
    await step('xóa ảnh', `DELETE FROM photos WHERE family_id IN (${marks})`, ...JUNK_FAMILIES);
    await step('xóa người', `DELETE FROM ancestors WHERE family_id IN (${marks})`, ...JUNK_FAMILIES);
    await step('xóa lời mời của họ test', `DELETE FROM invitations WHERE family_id IN (${marks})`, ...JUNK_FAMILIES);
    await step('xóa lời mời test còn lại', 'DELETE FROM invitations WHERE email LIKE ?', TEST_EMAIL);
    await step('xóa tài khoản của họ test', `DELETE FROM users WHERE family_id IN (${marks})`, ...JUNK_FAMILIES);
    await step('xóa tài khoản test lạc', 'DELETE FROM users WHERE email LIKE ?', TEST_EMAIL);
    await step('xóa nhật ký của họ test', `DELETE FROM audit_log WHERE family_id IN (${marks})`, ...JUNK_FAMILIES);
    await step('xóa mã đăng nhập test', 'DELETE FROM otp_challenges WHERE email LIKE ?', TEST_EMAIL);
    await step('xóa dòng họ test', `DELETE FROM families WHERE id IN (${marks})`, ...JUNK_FAMILIES);
  });

  // Mỗi fixture của bộ test dựng một schema riêng rồi tự bỏ đi; lần chạy nào bị ngắt
  // giữa chừng sẽ để lại schema dở dang. Chỉ bỏ đúng cái tên do fixture sinh ra.
  if (db.dialect === 'postgres') {
    const left = (await db.all("SELECT nspname FROM pg_namespace WHERE nspname LIKE 'test\\_%'"))
      .map(r => r.nspname).filter(name => /^test_[0-9a-f]{12}$/.test(name));
    for (const name of left) {
      await db.exec(`DROP SCHEMA IF EXISTS ${name} CASCADE`);
      console.log(`  bỏ schema test còn sót    ${name}`);
    }
    if (!left.length) console.log('  không còn schema test nào sót lại');
  }

  console.log('\nCòn lại:');
  for (const table of ['families', 'users', 'ancestors', 'photos', 'memories', 'invitations', 'audit_log']) {
    const { n } = await db.get(`SELECT COUNT(*) AS n FROM ${table}`);
    console.log(`  ${table.padEnd(14)} ${n}`);
  }
} finally {
  await db.close();
}
