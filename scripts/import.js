import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getConfig } from '../server/config.js';
import { openDatabase, transaction } from '../server/db.js';
import { parse, ancestorSchema } from '../server/validation.js';
import { occurrences, todayInVietnam, addDays, solarLabel, pad } from '../shared/lunar.js';

const config = getConfig();
const file = resolve(process.argv[2] || './scripts/gia-pha.json');
const roster = JSON.parse(readFileSync(file, 'utf8'));
if (!Array.isArray(roster.people) || !roster.people.length) {
  console.error(`Không tìm thấy danh sách "people" trong ${file}.`);
  process.exit(1);
}

const db = openDatabase(config.dbPath);
try {
  // The demo family is fixture data; the real line is the other one.
  let family = db.prepare("SELECT * FROM families WHERE id!='demo-family' ORDER BY created_at LIMIT 1").get();
  let owner = family ? db.prepare("SELECT * FROM users WHERE family_id=? AND role='admin' ORDER BY created_at LIMIT 1").get(family.id) : null;

  if (!family) {
    if (!config.adminEmail) {
      console.error('Chưa có dòng họ nào trong cơ sở dữ liệu. Hãy đặt ADMIN_EMAIL trong .env rồi chạy lại,');
      console.error('hoặc đăng nhập một lần bằng email quản lý để Cội tạo dòng họ trước.');
      process.exit(1);
    }
    const familyId = randomUUID(), userId = randomUUID();
    transaction(db, () => {
      db.prepare('INSERT INTO families(id,name) VALUES(?,?)').run(familyId, config.familyName);
      db.prepare("INSERT INTO users(id,family_id,email,name,role) VALUES(?,?,?,?,'admin')").run(userId, familyId, config.adminEmail, 'Người quản lý');
    });
    family = db.prepare('SELECT * FROM families WHERE id=?').get(familyId);
    owner = db.prepare('SELECT * FROM users WHERE id=?').get(userId);
    console.log(`Đã tạo dòng họ "${family.name}" và tài khoản quản lý ${config.adminEmail}.`);
  }
  if (!owner) { console.error('Dòng họ chưa có người quản lý nào để ghi nhận người tạo bản ghi.'); process.exit(1); }

  const existing = db.prepare('SELECT id,name FROM ancestors WHERE family_id=?').all(family.id);
  const byName = new Map(existing.map(a => [a.name, a.id]));
  let added = 0, skipped = 0, linked = 0, married = 0;

  for (const entry of roster.people) {
    if (byName.has(entry.name)) { console.log(`• Đã có ${entry.name}, giữ nguyên.`); skipped++; continue; }
    const { parent, spouse, ...fields } = entry;
    const person = parse(ancestorSchema, { ...fields, parent_id: null, spouse_id: null });
    const id = randomUUID();
    const columns = Object.keys(person);
    db.prepare(`INSERT INTO ancestors(id,family_id,created_by,${columns.join(',')}) VALUES(${Array(columns.length + 3).fill('?').join(',')})`)
      .run(id, family.id, owner.id, ...Object.values(person));
    byName.set(entry.name, id);
    console.log(`• Đã thêm ${entry.name} — giỗ ${pad(entry.lunar_day)}/${pad(entry.lunar_month)} âm lịch.`);
    added++;
  }

  // Links are resolved after every insert so a parent may sit anywhere in the file,
  // and they are reconciled for people already in Cội, not only the new ones.
  for (const entry of roster.people) {
    if (!entry.parent) continue;
    const childId = byName.get(entry.name), parentId = byName.get(entry.parent);
    if (!parentId) { console.warn(`  ! Không tìm thấy "${entry.parent}" để nối cho ${entry.name}.`); continue; }
    if (childId === parentId) { console.warn(`  ! ${entry.name} không thể là cha/mẹ của chính mình.`); continue; }
    const child = db.prepare('SELECT generation,parent_id FROM ancestors WHERE id=?').get(childId);
    const elder = db.prepare('SELECT generation FROM ancestors WHERE id=?').get(parentId);
    if (elder.generation >= child.generation) {
      console.warn(`  ! Bỏ qua nối ${entry.name} → ${entry.parent}: người thế hệ trước phải có số đời nhỏ hơn.`);
      continue;
    }
    if (child.parent_id === parentId) continue;
    db.prepare('UPDATE ancestors SET parent_id=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(parentId, childId);
    console.log(`• Nối ${entry.name} → ${entry.parent}.`);
    linked++;
  }

  // A marriage is written from both sides so either person's page shows the other.
  for (const entry of roster.people) {
    if (!entry.spouse) continue;
    const selfId = byName.get(entry.name), partnerId = byName.get(entry.spouse);
    if (!partnerId) { console.warn(`  ! Không tìm thấy "${entry.spouse}" để nối vợ/chồng cho ${entry.name}.`); continue; }
    if (selfId === partnerId) { console.warn(`  ! ${entry.name} không thể là vợ/chồng của chính mình.`); continue; }
    if (db.prepare('SELECT spouse_id FROM ancestors WHERE id=?').get(selfId).spouse_id === partnerId) continue;
    db.prepare('UPDATE ancestors SET spouse_id=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(partnerId, selfId);
    db.prepare('UPDATE ancestors SET spouse_id=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(selfId, partnerId);
    console.log(`• Nối vợ/chồng ${entry.name} ↔ ${entry.spouse}.`);
    married++;
  }

  console.log(`\n${added} người được thêm, ${skipped} người đã có sẵn, ${linked} liên kết cha/mẹ, ${married} liên kết vợ/chồng. Dòng họ: ${family.name}.`);
  const people = db.prepare('SELECT * FROM ancestors WHERE family_id=? AND deleted_at IS NULL').all(family.id);
  const today = todayInVietnam();
  console.log('\nNgày giỗ gần nhất của từng người:');
  for (const person of people) {
    const next = occurrences([person], today, addDays(today, 400))[0];
    const when = next ? `${solarLabel(next.date)}${next.shifted ? ' (lùi về ngày cuối tháng)' : ''} · còn ${next.daysAway} ngày` : 'không rơi vào 400 ngày tới';
    console.log(`  ${person.name.padEnd(22)} ${pad(person.lunar_day)}/${pad(person.lunar_month)} âm  →  ${when}`);
  }
} finally {
  db.close();
}
