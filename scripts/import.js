import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getConfig } from '../server/config.js';
import { openDatabase } from '../server/db.js';
import { parse, ancestorSchema } from '../server/validation.js';
import { occurrences, birthdayEvents, todayInVietnam, addDays, solarLabel, pad } from '../shared/lunar.js';

const config = getConfig();
const file = resolve(process.argv[2] || './scripts/gia-pha.json');
const roster = JSON.parse(readFileSync(file, 'utf8'));
if (!Array.isArray(roster.people) || !roster.people.length) {
  console.error(`Không tìm thấy danh sách "people" trong ${file}.`);
  process.exit(1);
}

// Every field the schema insists on, so an entry in the file only has to carry what is
// actually known about that person. A living relative has no memorial date at all, so
// the placeholder below is never read: occurrences() skips anyone marked living.
const base = {
  branch: 'Chưa phân chi', birth_year: null, death_year: null, birth_order: 0,
  lunar_day: 1, lunar_month: 1, leap_policy: 'regular', short_month_policy: 'last-day',
  location: '', biography: '', note: '', living: false, birth_date: '', phone: '',
  ...(roster.defaults || {}),
};

// Người đã có trong Đỗ Gia thì giữ nguyên, trừ những ô còn trống: hỏi được ngày sinh
// của một người rồi thêm vào file thì lần chạy sau phải điền được vào, chứ không thể
// bắt xóa người đi rồi nạp lại. Ghi đè lên ô đã có chữ thì phải nói rõ bằng --cap-nhat,
// để một lần chạy lại không lặng lẽ xóa mất thứ ai đó vừa sửa trong ứng dụng.
const OVERWRITE = process.argv.includes('--cap-nhat');
const FILLABLE = ['birth_order', 'birth_year', 'birth_date', 'phone', 'note', 'location', 'biography'];
const blank = value => value === null || value === undefined || value === '' || value === 0;

const db = await openDatabase(config.databaseUrl || config.dbPath);
try {
  // The demo family is fixture data; the real line is the other one.
  let family = await db.get("SELECT * FROM families WHERE id!='demo-family' ORDER BY created_at LIMIT 1");
  let owner = family ? await db.get("SELECT * FROM users WHERE family_id=? AND role='admin' ORDER BY created_at LIMIT 1", family.id) : null;

  if (!family) {
    if (!config.adminEmail) {
      console.error('Chưa có dòng họ nào trong cơ sở dữ liệu. Hãy đặt ADMIN_EMAIL trong .env rồi chạy lại,');
      console.error('hoặc đăng nhập một lần bằng email quản lý để Đỗ Gia tạo dòng họ trước.');
      process.exit(1);
    }
    const familyId = randomUUID(), userId = randomUUID();
    await db.transaction(async tx => {
      await tx.run('INSERT INTO families(id,name) VALUES(?,?)', familyId, config.familyName);
      await tx.run("INSERT INTO users(id,family_id,email,name,role) VALUES(?,?,?,?,'admin')", userId, familyId, config.adminEmail, 'Người quản lý');
    });
    family = await db.get('SELECT * FROM families WHERE id=?', familyId);
    owner = await db.get('SELECT * FROM users WHERE id=?', userId);
    console.log(`Đã tạo dòng họ "${family.name}" và tài khoản quản lý ${config.adminEmail}.`);
  }
  if (!owner) { console.error('Dòng họ chưa có người quản lý nào để ghi nhận người tạo bản ghi.'); process.exit(1); }

  const existing = await db.all('SELECT id,name FROM ancestors WHERE family_id=?', family.id);
  const byName = new Map(existing.map(a => [a.name, a.id]));
  let added = 0, skipped = 0, renamed = 0, linked = 0, married = 0, filled = 0;

  /** Điền vào những ô còn trống của một người đã có; trả về true nếu có sửa gì. */
  async function refresh(entry) {
    const id = byName.get(entry.name);
    const current = await db.get('SELECT * FROM ancestors WHERE id=?', id);
    const changes = {};
    for (const field of FILLABLE) {
      if (!(field in entry) || blank(entry[field]) || current[field] === entry[field]) continue;
      if (!blank(current[field]) && !OVERWRITE) continue;
      changes[field] = entry[field];
    }
    const fields = Object.keys(changes);
    if (!fields.length) { console.log(`• Đã có ${entry.name}, giữ nguyên.`); return false; }
    await db.run(`UPDATE ancestors SET ${fields.map(f => f + '=?').join(',')},revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      ...Object.values(changes), id);
    console.log(`• ${entry.name}: điền ${fields.join(', ')}.`);
    filled++;
    return true;
  }

  // A person already in the family under an older spelling — "Bác Đỗ Văn Lương" before the
  // gia phả settled on plain names — must be renamed, not inserted again, or the file
  // would quietly double every one of them.
  for (const entry of roster.people) {
    if (!entry.was || byName.has(entry.name) || !byName.has(entry.was)) continue;
    const id = byName.get(entry.was);
    await db.run('UPDATE ancestors SET name=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=?', entry.name, id);
    byName.delete(entry.was);
    byName.set(entry.name, id);
    console.log(`• Đổi tên "${entry.was}" thành "${entry.name}".`);
    renamed++;
  }

  for (const entry of roster.people) {
    if (byName.has(entry.name)) { if (!(await refresh(entry))) skipped++; continue; }
    const { parent, spouse, was, ...fields } = entry;
    const person = parse(ancestorSchema, { ...base, ...fields, parent_id: null, spouse_id: null });
    const id = randomUUID();
    const columns = Object.keys(person);
    await db.run(`INSERT INTO ancestors(id,family_id,created_by,${columns.join(',')}) VALUES(${Array(columns.length + 3).fill('?').join(',')})`,
      id, family.id, owner.id, ...Object.values(person));
    byName.set(entry.name, id);
    const born = person.birth_date ? `, sinh ${solarLabel(person.birth_date)} dương lịch`
      : person.birth_year ? `, sinh năm ${person.birth_year}` : '';
    console.log(person.living
      ? `• Đã thêm ${entry.name} — còn sống${born}.`
      : `• Đã thêm ${entry.name} — giỗ ${pad(person.lunar_day)}/${pad(person.lunar_month)} âm lịch.`);
    added++;
  }

  // Links are resolved after every insert so a parent may sit anywhere in the file,
  // and they are reconciled for people already in Đỗ Gia, not only the new ones.
  for (const entry of roster.people) {
    if (!entry.parent) continue;
    const childId = byName.get(entry.name), parentId = byName.get(entry.parent);
    if (!parentId) { console.warn(`  ! Không tìm thấy "${entry.parent}" để nối cho ${entry.name}.`); continue; }
    if (childId === parentId) { console.warn(`  ! ${entry.name} không thể là cha/mẹ của chính mình.`); continue; }
    const child = await db.get('SELECT generation,parent_id FROM ancestors WHERE id=?', childId);
    const elder = await db.get('SELECT generation FROM ancestors WHERE id=?', parentId);
    if (elder.generation >= child.generation) {
      console.warn(`  ! Bỏ qua nối ${entry.name} → ${entry.parent}: người thế hệ trước phải có số đời nhỏ hơn.`);
      continue;
    }
    if (child.parent_id === parentId) continue;
    await db.run('UPDATE ancestors SET parent_id=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=?', parentId, childId);
    console.log(`• Nối ${entry.name} → ${entry.parent}.`);
    linked++;
  }

  // A marriage is written from both sides so either person's page shows the other.
  for (const entry of roster.people) {
    if (!entry.spouse) continue;
    const selfId = byName.get(entry.name), partnerId = byName.get(entry.spouse);
    if (!partnerId) { console.warn(`  ! Không tìm thấy "${entry.spouse}" để nối vợ/chồng cho ${entry.name}.`); continue; }
    if (selfId === partnerId) { console.warn(`  ! ${entry.name} không thể là vợ/chồng của chính mình.`); continue; }
    if ((await db.get('SELECT spouse_id FROM ancestors WHERE id=?', selfId)).spouse_id === partnerId) continue;
    await db.run('UPDATE ancestors SET spouse_id=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=?', partnerId, selfId);
    await db.run('UPDATE ancestors SET spouse_id=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=?', selfId, partnerId);
    console.log(`• Nối vợ/chồng ${entry.name} ↔ ${entry.spouse}.`);
    married++;
  }

  console.log(`\n${added} người được thêm, ${filled} người được điền thêm thông tin, ${skipped} người giữ nguyên, ${renamed} người được đổi tên, ${linked} liên kết cha/mẹ, ${married} liên kết vợ/chồng. Dòng họ: ${family.name}.`);
  if (!OVERWRITE) console.log('Chỉ những ô đang trống mới được điền. Muốn ghi đè cả những ô đã có chữ thì chạy: npm run import -- --cap-nhat');

  const people = await db.all('SELECT * FROM ancestors WHERE family_id=? AND deleted_at IS NULL', family.id);
  const today = todayInVietnam(), horizon = addDays(today, 400);
  const departed = people.filter(p => !p.living), alive = people.filter(p => p.living);
  const label = person => person.name.padEnd(20);

  console.log(`\nĐã mất — ${departed.length} người, ngày giỗ gần nhất:`);
  for (const person of departed) {
    const next = occurrences([person], today, horizon)[0];
    const shifted = next?.shifted ? ' (lùi về ngày cuối tháng)' : '';
    const when = next ? `${solarLabel(next.date)}${shifted} · còn ${next.daysAway} ngày` : 'không rơi vào 400 ngày tới';
    console.log(`  ${label(person)} ${pad(person.lunar_day)}/${pad(person.lunar_month)} âm  →  ${when}`);
  }

  // Birthdays are solar: a date in birth_date recurs on the same day of the Gregorian
  // year, unlike a memorial date, which is lunar and moves against the solar calendar.
  console.log(`\nCòn sống — ${alive.length} người:`);
  const birthdays = birthdayEvents(alive, today, horizon);
  for (const person of alive) {
    const next = birthdays.find(b => b.id === person.id);
    const when = next ? `sinh nhật ${solarLabel(next.date)} dương lịch · còn ${next.daysAway} ngày, tròn ${next.turning} tuổi`
      : person.birth_year ? `sinh năm ${person.birth_year} — chưa có ngày sinh cụ thể, lịch chưa nhắc sinh nhật`
      : 'chưa có ngày sinh';
    console.log(`  ${label(person)} ${when}`);
  }
  const waiting = alive.filter(p => !p.birth_date).length;
  if (waiting) console.log(`\nCòn ${waiting} người chưa có ngày sinh đầy đủ. Hỏi được ngày nào thì thêm vào scripts/gia-pha.json rồi chạy lại "npm run import" — ô đang trống sẽ được điền vào.`);
} finally {
  await db.close();
}
