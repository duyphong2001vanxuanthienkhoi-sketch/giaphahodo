import { Pool, types } from '@neondatabase/serverless';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { DEFAULT_OBSERVANCES } from '../shared/lunar.js';

/** Columns added after the first release. Both engines take a constant default here,
 * and a REFERENCES clause only when the new column defaults to NULL. */
const additions = [
  ['users', 'share_phone', 'INTEGER NOT NULL DEFAULT 0'],
  ['ancestors', 'photo_id', 'TEXT REFERENCES photos(id) ON DELETE SET NULL'],
  ['ancestors', 'spouse_id', 'TEXT REFERENCES ancestors(id) ON DELETE SET NULL'],
  ['ancestors', 'deleted_at', 'INTEGER', 'BIGINT'],   // epoch millis: 32-bit is not enough on Postgres
  ['ancestors', 'revision', 'INTEGER NOT NULL DEFAULT 1'],
  ['photos', 'caption', "TEXT NOT NULL DEFAULT ''"],
  ['photos', 'url', "TEXT NOT NULL DEFAULT ''"],
  ['ancestors', 'living', 'INTEGER NOT NULL DEFAULT 0'],
  ['ancestors', 'birth_date', "TEXT NOT NULL DEFAULT ''"],
  ['ancestors', 'phone', "TEXT NOT NULL DEFAULT ''"],
  ['users', 'password_hash', "TEXT NOT NULL DEFAULT ''"],
  ['users', 'approved', 'INTEGER NOT NULL DEFAULT 1'],   // tài khoản tự đăng ký chờ duyệt   // Blob address; empty when stored on disk
  ['families', 'observances', `TEXT NOT NULL DEFAULT '${JSON.stringify(DEFAULT_OBSERVANCES)}'`],
];

export const isPostgres = target => /^postgres(ql)?:\/\//.test(String(target || ''));

// int8 arrives as a string so no precision is lost. Every bigint here is an epoch
// millisecond, far below Number.MAX_SAFE_INTEGER, and the app compares them as numbers.
types.setTypeParser(20, Number);

// SQLite's CURRENT_TIMESTAMP yields the exact text these columns store; Postgres yields
// a timestamptz that will not go into a TEXT column, so spell out the same shape.
const PG_NOW = "to_char(now() AT TIME ZONE 'utc','YYYY-MM-DD HH24:MI:SS')";

/** Translate one statement from the SQLite spelling the app is written in to Postgres:
 * number the placeholders and swap CURRENT_TIMESTAMP. Both only outside quoted text,
 * so a question mark or the word inside a string literal is left untouched. */
export function toPgSql(sql) {
  let out = '', index = 0, quote = null, i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    if (quote) { out += ch; if (ch === quote) quote = null; i++; continue; }
    if (ch === "'" || ch === '"') { quote = ch; out += ch; i++; continue; }
    if (ch === '?') { out += '$' + (++index); i++; continue; }
    if (sql.startsWith('CURRENT_TIMESTAMP', i)) { out += PG_NOW; i += 'CURRENT_TIMESTAMP'.length; continue; }
    out += ch; i++;
  }
  return out;
}

/** Postgres hands back Date objects; SQLite hands back the string the client code
 * already parses. Normalise so neither side of the app has to care which engine ran. */
function normalise(row) {
  if (!row) return row;
  for (const key of Object.keys(row)) {
    const value = row[key];
    if (value instanceof Date) row[key] = value.toISOString().replace('T', ' ').slice(0, 19);
    else if (typeof value === 'bigint') row[key] = Number(value);
  }
  return row;
}

async function sqliteDriver(path) {
  // Loaded here, not at module scope: the Postgres path must not need node:sqlite,
  // which only exists unflagged from Node 24.
  const { DatabaseSync } = await import('node:sqlite');
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const handle = new DatabaseSync(path);
  handle.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  const api = {
    dialect: 'sqlite',
    async get(sql, ...params) { return normalise(handle.prepare(sql).get(...params)); },
    async all(sql, ...params) { return handle.prepare(sql).all(...params).map(normalise); },
    async run(sql, ...params) { return { changes: Number(handle.prepare(sql).run(...params).changes) }; },
    async exec(sql) { handle.exec(sql); },
    async columns(table) { return handle.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name); },
    async hasTable(name) { return !!handle.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name); },
    // One connection, so the transaction body can simply reuse this same handle.
    async transaction(fn) {
      handle.exec('BEGIN IMMEDIATE');
      try { const result = await fn(api); handle.exec('COMMIT'); return result; }
      catch (error) { handle.exec('ROLLBACK'); throw error; }
    },
    async close() { handle.close(); },
  };
  return api;
}

function postgresDriver(url, schema) {
  const pool = new Pool({ connectionString: url });
  // Neon's pooled endpoint rejects search_path as a startup parameter, so pin it on each
  // physical connection instead. Always set it, never only for tests: a pooler reuses
  // server connections between clients, so a value another client left behind would
  // otherwise stick and point this app at a schema that may not even exist.
  pool.on('connect', client => client.query(`SET search_path TO ${schema || 'public'}`));
  // An idle connection dropped by the pooler emits 'error' on the pool. With no listener
  // Node treats it as unhandled and kills the process, so a long-running Đỗ Gia would die
  // of a connection it was not even using. Log it and let the pool open another.
  pool.on('error', error => console.error('[Đỗ Gia] Kết nối Postgres nhàn rỗi bị lỗi:', error.message));
  const run = async (executor, sql, params) => executor.query(toPgSql(sql), params);
  const wrap = executor => ({
    dialect: 'postgres',
    async get(sql, ...params) { return normalise((await run(executor, sql, params)).rows[0]); },
    async all(sql, ...params) { return (await run(executor, sql, params)).rows.map(normalise); },
    async run(sql, ...params) { return { changes: (await run(executor, sql, params)).rowCount ?? 0 }; },
    async exec(sql) {
      for (const statement of splitStatements(sql)) await executor.query(statement);
    },
    async columns(table) {
      // information_schema spans every visible schema, so pin it to the one in use
      // or a table of the same name elsewhere would mask a missing column here.
      const { rows } = await executor.query('SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=$1', [table]);
      return rows.map(r => r.column_name);
    },
    async hasTable(name) {
      const { rows } = await executor.query('SELECT to_regclass($1) AS found', [name]);
      return !!rows[0]?.found;
    },
  });
  const api = {
    ...wrap(pool),
    // The HTTP driver cannot hold a transaction open, so take a single pooled
    // connection and hand the body a handle bound to it.
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(wrap(client));
        await client.query('COMMIT');
        return result;
      } catch (error) {
        try { await client.query('ROLLBACK'); } catch { /* connection already gone */ }
        throw error;
      } finally { client.release(); }
    },
    async close() { await pool.end(); },
    async dropSchema() {
      if (!schema) return;
      const setup = new Pool({ connectionString: url });
      try { await setup.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); } finally { await setup.end(); }
    },
  };
  return api;
}

const SAFE_SCHEMA = /^[a-z_][a-z0-9_]{0,48}$/;

/** Postgres has no multi-statement exec through this driver; split on the semicolons
 * that end a statement rather than ones inside a quoted default. */
export function splitStatements(sql) {
  const statements = [];
  let current = '', quote = null;
  for (const ch of sql) {
    if (quote) { current += ch; if (ch === quote) quote = null; continue; }
    if (ch === "'" || ch === '"') { quote = ch; current += ch; continue; }
    if (ch === ';') { if (current.trim()) statements.push(current.trim()); current = ''; continue; }
    current += ch;
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

export async function migrate(db) {
  for (const [table, column, definition, pgDefinition] of additions) {
    if (!(await db.hasTable(table))) continue;
    if ((await db.columns(table)).includes(column)) continue;
    const type = db.dialect === 'postgres' && pgDefinition ? pgDefinition : definition;
    // Kiểm-tra-rồi-thêm là một cuộc đua: hai tiến trình cùng khởi động sẽ cùng thấy
    // cột chưa có rồi cùng thêm. Postgres có IF NOT EXISTS nên để chính nó phân xử;
    // SQLite không có, nhưng ở đó chỉ một tiến trình giữ tệp nên không xảy ra đua.
    const guard = db.dialect === 'postgres' ? 'IF NOT EXISTS ' : '';
    await db.exec(`ALTER TABLE ${table} ADD COLUMN ${guard}${column} ${type}`);
  }
}

export async function openDatabase(target, { schema = '' } = {}) {
  if (schema && !SAFE_SCHEMA.test(schema)) throw new Error('Tên schema không hợp lệ.');
  if (isPostgres(target) && schema) {
    const setup = new Pool({ connectionString: target });
    try { await setup.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`); } finally { await setup.end(); }
  }
  const db = isPostgres(target) ? postgresDriver(target, schema) : await sqliteDriver(target);
  const file = db.dialect === 'postgres' ? './schema.pg.sql' : './schema.sql';
  await db.exec(readFileSync(new URL(file, import.meta.url), 'utf8'));
  await migrate(db);
  return db;
}

/** Kept as a named export so call sites read the same as before the adapter landed. */
export const transaction = (db, fn) => db.transaction(fn);
