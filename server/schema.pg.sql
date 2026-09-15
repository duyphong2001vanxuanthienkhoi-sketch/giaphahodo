-- Sinh từ schema.sql cho Postgres. Sửa schema.sql rồi sinh lại.
CREATE TABLE IF NOT EXISTS families (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  home TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'utc','YYYY-MM-DD HH24:MI:SS')
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES families(id),
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL CHECK(role IN ('admin','member')),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'utc','YYYY-MM-DD HH24:MI:SS')
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS otp_challenges (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  invite_hash TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS rate_limits (
  scope TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  reset_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS invitations (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES families(id),
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','member')),
  token_hash TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL REFERENCES users(id),
  expires_at BIGINT NOT NULL,
  used_at BIGINT,
  revoked_at BIGINT,
  created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'utc','YYYY-MM-DD HH24:MI:SS')
);
CREATE TABLE IF NOT EXISTS ancestors (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES families(id),
  name TEXT NOT NULL,
  generation INTEGER NOT NULL CHECK(generation BETWEEN 1 AND 30),
  branch TEXT NOT NULL DEFAULT 'Chi trưởng',
  birth_year INTEGER,
  death_year INTEGER,
  parent_id TEXT REFERENCES ancestors(id) ON DELETE SET NULL,
  lunar_day INTEGER NOT NULL CHECK(lunar_day BETWEEN 1 AND 30),
  lunar_month INTEGER NOT NULL CHECK(lunar_month BETWEEN 1 AND 12),
  leap_policy TEXT NOT NULL DEFAULT 'regular' CHECK(leap_policy IN ('regular','prefer-leap','both')),
  short_month_policy TEXT NOT NULL DEFAULT 'last-day' CHECK(short_month_policy IN ('last-day','skip')),
  location TEXT NOT NULL DEFAULT '',
  biography TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'utc','YYYY-MM-DD HH24:MI:SS')
);
CREATE TABLE IF NOT EXISTS reminder_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  days TEXT NOT NULL DEFAULT '[7,3,0]',
  hour INTEGER NOT NULL DEFAULT 7 CHECK(hour BETWEEN 0 AND 23),
  minute INTEGER NOT NULL DEFAULT 0 CHECK(minute BETWEEN 0 AND 59),
  all_events INTEGER NOT NULL DEFAULT 1 CHECK(all_events IN (0,1))
);
CREATE TABLE IF NOT EXISTS subscriptions (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ancestor_id TEXT NOT NULL REFERENCES ancestors(id) ON DELETE CASCADE,
  PRIMARY KEY(user_id, ancestor_id)
);
CREATE TABLE IF NOT EXISTS mail_deliveries (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  delivery_key TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ancestor_id TEXT NOT NULL REFERENCES ancestors(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK(status IN ('pending','sent','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  attempted_at BIGINT NOT NULL,
  sent_at TEXT,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_ancestors_family ON ancestors(family_id);
CREATE INDEX IF NOT EXISTS idx_users_family ON users(family_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_invites_family ON invitations(family_id);
CREATE TABLE IF NOT EXISTS calendar_tokens (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'utc','YYYY-MM-DD HH24:MI:SS')
);
CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES families(id),
  ancestor_id TEXT NOT NULL REFERENCES ancestors(id) ON DELETE CASCADE,
  mime TEXT NOT NULL CHECK(mime IN ('image/jpeg','image/png','image/webp')),
  bytes INTEGER NOT NULL,
  caption TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'utc','YYYY-MM-DD HH24:MI:SS')
);
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES families(id),
  ancestor_id TEXT NOT NULL REFERENCES ancestors(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at BIGINT,
  created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'utc','YYYY-MM-DD HH24:MI:SS')
);
CREATE TABLE IF NOT EXISTS attendance (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ancestor_id TEXT NOT NULL REFERENCES ancestors(id) ON DELETE CASCADE,
  event_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('yes','maybe','no')),
  note TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'utc','YYYY-MM-DD HH24:MI:SS'),
  PRIMARY KEY(user_id,ancestor_id,event_date)
);
CREATE INDEX IF NOT EXISTS idx_memories_ancestor ON memories(ancestor_id,status);
CREATE INDEX IF NOT EXISTS idx_attendance_event ON attendance(ancestor_id,event_date);
CREATE INDEX IF NOT EXISTS idx_photos_ancestor ON photos(ancestor_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_attempted ON mail_deliveries(attempted_at);
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  family_id TEXT,
  action TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  ip_hash TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'utc','YYYY-MM-DD HH24:MI:SS')
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
