import { randomUUID } from 'node:crypto';

/** Which database the suite may use.
 *
 * Never DATABASE_URL. That one is the live database, and a suite that creates and drops
 * a schema per fixture does real damage there: on Neon's pooled endpoint a statement
 * outside a transaction hands its server connection straight back, so the `SET
 * search_path` a test leaves behind is inherited by whoever borrows that connection
 * next — including the deployed app, which then reports that `users` or `ancestors`
 * does not exist while the rows sit untouched in `public`. Test rows travel the same
 * way in the other direction and land in the live tables.
 *
 * So Postgres coverage comes from TEST_DATABASE_URL: a separate Neon branch, and its
 * direct endpoint (host without `-pooler`) so each fixture really keeps its own session.
 * Unset, the suite runs on a throwaway SQLite file and still covers everything else. */
export function testDatabase(sqlitePath) {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return { target: sqlitePath, schema: '' };
  if (sameDatabase(url, process.env.DATABASE_URL)) throw new Error(
    'TEST_DATABASE_URL đang trỏ vào đúng database của DATABASE_URL. Hãy tạo một nhánh Neon riêng cho test.');
  return { target: url, schema: 'test_' + randomUUID().replaceAll('-', '').slice(0, 12) };
}

/** The pooled and direct endpoints of one Neon branch are the same database under two
 * host names, so compare with `-pooler` stripped rather than comparing the URLs. */
export function sameDatabase(a, b) {
  const key = url => { try { const u = new URL(url); return u.host.replace('-pooler', '') + u.pathname; } catch { return null; } };
  const left = key(a), right = key(b);
  return !!left && left === right;
}
