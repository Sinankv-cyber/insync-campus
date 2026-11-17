import "server-only";
import { getDb } from "./db";

/** Portable DDL. {TS} -> timestamptz (Postgres) / TEXT ISO-8601 UTC (SQLite). All times stored in UTC. */
const MIGRATIONS: { version: number; name: string; sql: string }[] = [
  {
    version: 1,
    name: "core",
    sql: `
CREATE TABLE IF NOT EXISTS hostels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('student','teacher','warden','admin')),
  password_hash TEXT,
  google_sub TEXT UNIQUE,
  roll_no TEXT UNIQUE,
  hostel_id TEXT REFERENCES hostels(id),
  room TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at {TS} NOT NULL
);
CREATE INDEX IF NOT EXISTS users_role_idx ON users(role, name);
CREATE INDEX IF NOT EXISTS users_hostel_idx ON users(hostel_id, name);
CREATE TABLE IF NOT EXISTS warden_hostels (
  warden_id TEXT NOT NULL REFERENCES users(id),
  hostel_id TEXT NOT NULL REFERENCES hostels(id),
  PRIMARY KEY (warden_id, hostel_id)
);
CREATE TABLE IF NOT EXISTS classes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  subject_code TEXT NOT NULL,
  enroll_code TEXT NOT NULL UNIQUE,
  teacher_id TEXT NOT NULL REFERENCES users(id),
  created_at {TS} NOT NULL
);
CREATE INDEX IF NOT EXISTS classes_teacher_idx ON classes(teacher_id);
CREATE TABLE IF NOT EXISTS class_enrollments (
  class_id TEXT NOT NULL REFERENCES classes(id),
  student_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK (status IN ('pending','approved','rejected')),
  requested_at {TS} NOT NULL,
  decided_at {TS},
  decided_by TEXT REFERENCES users(id),
  PRIMARY KEY (class_id, student_id)
);
CREATE INDEX IF NOT EXISTS enroll_student_idx ON class_enrollments(student_id);
CREATE TABLE IF NOT EXISTS phones (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES users(id),
  description TEXT NOT NULL,
  storage_slot TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at {TS} NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS phones_one_active_per_student ON phones(student_id) WHERE active = 1;
CREATE TABLE IF NOT EXISTS attendance_sessions (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES classes(id),
  teacher_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK (status IN ('open','closed','finalized')),
  opened_at {TS} NOT NULL,
  closed_at {TS},
  finalized_at {TS}
);
CREATE UNIQUE INDEX IF NOT EXISTS sessions_one_open_per_class ON attendance_sessions(class_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS sessions_class_idx ON attendance_sessions(class_id, opened_at);
CREATE TABLE IF NOT EXISTS attendance_records (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES attendance_sessions(id),
  student_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK (status IN ('pending','present','late','absent','excused')),
  method TEXT NOT NULL CHECK (method IN ('qr','code','manual','finalize_default')),
  manual_reason TEXT,
  face_check TEXT NOT NULL DEFAULT 'not_checked' CHECK (face_check IN ('face_detected','no_face','not_checked')),
  face_image TEXT,
  requested_at {TS} NOT NULL,
  decided_by TEXT REFERENCES users(id),
  decided_at {TS},
  UNIQUE (session_id, student_id)
);
CREATE INDEX IF NOT EXISTS records_student_idx ON attendance_records(student_id, requested_at);
CREATE TABLE IF NOT EXISTS credentials (
  id TEXT PRIMARY KEY,
  purpose TEXT NOT NULL CHECK (purpose IN ('attendance_join','deposit','collect')),
  code TEXT NOT NULL UNIQUE,
  subject_id TEXT NOT NULL,
  issued_to TEXT REFERENCES users(id),
  expires_at {TS} NOT NULL,
  consumed_at {TS},
  consumed_by TEXT REFERENCES users(id),
  revoked_at {TS},
  created_at {TS} NOT NULL
);
CREATE INDEX IF NOT EXISTS credentials_subject_idx ON credentials(subject_id, purpose);
CREATE TABLE IF NOT EXISTS policy_versions (
  id TEXT PRIMARY KEY,
  version INTEGER NOT NULL UNIQUE,
  use_start TEXT NOT NULL,
  use_end TEXT NOT NULL,
  grace_minutes INTEGER NOT NULL CHECK (grace_minutes >= 0 AND grace_minutes <= 240),
  timezone TEXT NOT NULL,
  created_by TEXT REFERENCES users(id),
  created_at {TS} NOT NULL
);
CREATE TABLE IF NOT EXISTS deposit_cycles (
  id TEXT PRIMARY KEY,
  cycle_key TEXT NOT NULL UNIQUE,
  is_demo INTEGER NOT NULL DEFAULT 0,
  policy_version_id TEXT NOT NULL REFERENCES policy_versions(id),
  use_start TEXT NOT NULL,
  use_end TEXT NOT NULL,
  grace_minutes INTEGER NOT NULL,
  timezone TEXT NOT NULL,
  window_start {TS} NOT NULL,
  window_end {TS} NOT NULL,
  deadline {TS} NOT NULL,
  evaluated_at {TS},
  created_at {TS} NOT NULL
);
CREATE INDEX IF NOT EXISTS cycles_deadline_idx ON deposit_cycles(deadline);
CREATE TABLE IF NOT EXISTS custody_receipts (
  id TEXT PRIMARY KEY,
  phone_id TEXT NOT NULL REFERENCES phones(id),
  student_id TEXT NOT NULL REFERENCES users(id),
  cycle_id TEXT REFERENCES deposit_cycles(id),
  storage_slot TEXT NOT NULL,
  deposited_at {TS} NOT NULL,
  received_by TEXT NOT NULL REFERENCES users(id),
  deposit_method TEXT NOT NULL CHECK (deposit_method IN ('qr','code','id_lookup')),
  deposit_note TEXT,
  credential_id TEXT UNIQUE REFERENCES credentials(id),
  returned_at {TS},
  returned_by TEXT REFERENCES users(id),
  return_method TEXT CHECK (return_method IN ('qr','code','id_lookup')),
  return_note TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS custody_one_active_per_phone ON custody_receipts(phone_id) WHERE returned_at IS NULL;
CREATE INDEX IF NOT EXISTS custody_student_idx ON custody_receipts(student_id, deposited_at);
CREATE INDEX IF NOT EXISTS custody_cycle_idx ON custody_receipts(cycle_id);
CREATE TABLE IF NOT EXISTS exceptions (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,
  starts_at {TS} NOT NULL,
  expires_at {TS} NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','approved','rejected','revoked')),
  requested_by TEXT NOT NULL REFERENCES users(id),
  decided_by TEXT REFERENCES users(id),
  decided_at {TS},
  decision_note TEXT,
  created_at {TS} NOT NULL
);
CREATE INDEX IF NOT EXISTS exceptions_student_idx ON exceptions(student_id, expires_at);
CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('phone_not_deposited')),
  student_id TEXT NOT NULL REFERENCES users(id),
  cycle_id TEXT NOT NULL REFERENCES deposit_cycles(id),
  status TEXT NOT NULL CHECK (status IN ('open','resolved')),
  created_at {TS} NOT NULL,
  resolved_at {TS},
  resolved_receipt_id TEXT REFERENCES custody_receipts(id),
  UNIQUE (kind, student_id, cycle_id)
);
CREATE INDEX IF NOT EXISTS alerts_status_idx ON alerts(status, created_at);
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at {TS} NOT NULL,
  read_at {TS},
  push_status TEXT NOT NULL DEFAULT 'pending',
  push_attempted_at {TS}
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id, created_at);
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at {TS} NOT NULL
);
CREATE INDEX IF NOT EXISTS push_user_idx ON push_subscriptions(user_id);
CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  actor_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  subject_user_id TEXT REFERENCES users(id),
  detail TEXT,
  created_at {TS} NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_events(created_at);
CREATE INDEX IF NOT EXISTS audit_subject_idx ON audit_events(subject_user_id, created_at);
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  window_start {TS} NOT NULL
);
`,
  },
];

let migrated: Promise<unknown> | null = null;

export function ensureMigrated(): Promise<unknown> {
  if (!migrated) migrated = runMigrations().catch((e) => { migrated = null; throw e; });
  return migrated as Promise<unknown>;
}

export async function runMigrations(): Promise<string[]> {
  const db = getDb();
  const ts = db.driver === "neon" ? "timestamptz" : "TEXT";
  await db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)`);
  const done = new Set((await db.all<{ version: number }>(`SELECT version FROM schema_migrations`)).map((r) => Number(r.version)));
  const applied: string[] = [];
  for (const m of MIGRATIONS) {
    if (done.has(m.version)) continue;
    const sql = m.sql.replaceAll("{TS}", ts);
    await db.tx(async (tx) => {
      for (const stmt of sql.split(";").map((s) => s.trim()).filter(Boolean)) await tx.run(stmt);
      await tx.run(`INSERT INTO schema_migrations (version, name, applied_at) VALUES ($1, $2, $3) ON CONFLICT (version) DO NOTHING`, [m.version, m.name, new Date().toISOString()]);
    });
    applied.push(`${m.version}_${m.name}`);
  }
  return applied;
}
