import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { DEFAULT_OBSERVANCES } from '../shared/lunar.js';

/** Columns added after the first release. SQLite only takes constant defaults here,
 * and a REFERENCES clause only when the new column defaults to NULL. */
const additions = [
  ['users', 'share_phone', 'INTEGER NOT NULL DEFAULT 0'],
  ['ancestors', 'photo_id', 'TEXT REFERENCES photos(id) ON DELETE SET NULL'],
  ['ancestors', 'deleted_at', 'INTEGER'],
  ['ancestors', 'revision', 'INTEGER NOT NULL DEFAULT 1'],
  ['photos', 'caption', "TEXT NOT NULL DEFAULT ''"],
  ['families', 'observances', `TEXT NOT NULL DEFAULT '${JSON.stringify(DEFAULT_OBSERVANCES)}'`],
];

export function migrate(db) {
  for (const [table, column, definition] of additions) {
    if (!db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(table)) continue;
    if (db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === column)) continue;
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function openDatabase(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
  migrate(db);
  return db;
}

export function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const result = fn(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}
