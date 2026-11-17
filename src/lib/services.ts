import "server-only";
import * as webpush from "web-push";
import { getDb, isUniqueViolation, type Tx } from "./db";
import { fail } from "./api";
import { newCode, newId, nowIso } from "./util";
import { cycleBounds, currentCycleDate, type PolicyTimes } from "./schedule";

// ---------------- Audit ----------------
export async function audit(tx: Tx, a: { actorId: string | null; action: string; entityType: string; entityId?: string | null; subjectUserId?: string | null; detail?: Record<string, unknown> }) {
  await tx.run(
    `INSERT INTO audit_events (id, actor_id, action, entity_type, entity_id, subject_user_id, detail, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [newId("ae_"), a.actorId, a.action, a.entityType, a.entityId ?? null, a.subjectUserId ?? null, a.detail ? JSON.stringify(a.detail) : null, nowIso()],
  );
}

// ---------------- Rate limiting (durable, per key) ----------------
export async function checkRateLimit(key: string, max: number, windowSec: number) {
  const db = getDb();
  const r = await db.get<{ count: number; window_start: string }>(`SELECT count, window_start FROM rate_limits WHERE key = $1`, [key]);
  if (r && Date.now() - new Date(r.window_start).getTime() < windowSec * 1000 && Number(r.count) >= max) {
    const retry = Math.ceil((new Date(r.window_start).getTime() + windowSec * 1000 - Date.now()) / 1000);
    throw fail("RATE_LIMITED", `Too many failed attempts. Try again in ${retry} seconds.`, 429, { retryAfter: retry });
  }
}
export async function recordFailure(key: string, windowSec: number) {
  const db = getDb();
  const now = nowIso();
  const cutoff = new Date(Date.now() - windowSec * 1000).toISOString();
  await db.run(
    `INSERT INTO rate_limits (key, count, window_start) VALUES ($1, 1, $2)
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN rate_limits.window_start < $3 THEN 1 ELSE rate_limits.count + 1 END,
       window_start = CASE WHEN rate_limits.window_start < $3 THEN $2 ELSE rate_limits.window_start END`,
    [key, now, cutoff],
  );
}
export async function clearFailures(key: string) {
  await getDb().run(`DELETE FROM rate_limits WHERE key = $1`, [key]);
}

// ---------------- Notifications: persist first, then attempt push ----------------
export function pushConfigured() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
}

export async function persistNotification(tx: Tx, userId: string, kind: string, title: string, body: string) {
  const id = newId("nt_");
  await tx.run(`INSERT INTO notifications (id, user_id, kind, title, body, created_at, push_status) VALUES ($1,$2,$3,$4,$5,$6,'pending')`, [id, userId, kind, title, body, nowIso()]);
  return id;
}

/** Best-effort delivery after commit. Status is recorded honestly per notification. */
export async function deliverPending(ids: string[]) {
  if (!ids.length) return;
  const db = getDb();
  const setStatus = async (list: string[], status: string) => {
    if (!list.length) return;
    await db.run(`UPDATE notifications SET push_status = $1, push_attempted_at = $2 WHERE id IN (${list.map((_, i) => `$${i + 3}`).join(",")})`, [status, nowIso(), ...list]);
  };
  if (!pushConfigured()) { await setStatus(ids, "not_configured"); return; }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT!, process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(",");
  const rows = await db.all<{ id: string; user_id: string; title: string; body: string }>(`SELECT id, user_id, title, body FROM notifications WHERE id IN (${placeholders})`, ids);
  const users = [...new Set(rows.map((r) => r.user_id))];
  const subs = users.length
    ? await db.all<{ id: string; user_id: string; endpoint: string; p256dh: string; auth: string }>(
        `SELECT id, user_id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id IN (${users.map((_, i) => `$${i + 1}`).join(",")})`, users)
    : [];
  const withSub = new Set(subs.map((s) => s.user_id));
  await setStatus(rows.filter((n) => !withSub.has(n.user_id)).map((n) => n.id), "no_subscription");
  for (const n of rows.filter((r) => withSub.has(r.user_id))) {
    const mine = subs.filter((s) => s.user_id === n.user_id);
    let status = "failed";
    for (const s of mine) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ title: n.title, body: n.body }), { TTL: 3600, timeout: 5000 });
        status = "sent_to_push_service";
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await db.run(`DELETE FROM push_subscriptions WHERE id = $1`, [s.id]);
      }
    }
    await db.run(`UPDATE notifications SET push_status=$2, push_attempted_at=$3 WHERE id=$1`, [n.id, status, nowIso()]);
  }
}

// ---------------- Policy & cycles ----------------
export type Policy = PolicyTimes & { id: string; version: number; created_at: string };
export type Cycle = {
  id: string; cycle_key: string; is_demo: number; policy_version_id: string; use_start: string; use_end: string;
  grace_minutes: number; timezone: string; window_start: string; window_end: string; deadline: string; evaluated_at: string | null;
};

export async function activePolicy(): Promise<Policy> {
  const p = await getDb().get<Policy>(`SELECT id, version, use_start, use_end, grace_minutes, timezone, created_at FROM policy_versions ORDER BY version DESC LIMIT 1`);
  if (!p) throw fail("NOT_CONFIGURED", "No phone-use policy has been configured.", 503);
  return { ...p, grace_minutes: Number(p.grace_minutes), version: Number(p.version) };
}

/** Ensure the cycle row for a local date exists, snapshotting the policy that applies at creation. */
export async function ensureCycle(date: string, policy: Policy): Promise<Cycle> {
  const db = getDb();
  const existing = await db.get<Cycle>(`SELECT * FROM deposit_cycles WHERE cycle_key = $1`, [date]);
  if (existing) return existing;
  const b = cycleBounds(date, policy);
  try {
    await db.run(
      `INSERT INTO deposit_cycles (id, cycle_key, is_demo, policy_version_id, use_start, use_end, grace_minutes, timezone, window_start, window_end, deadline, created_at)
       VALUES ($1,$2,0,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (cycle_key) DO NOTHING`,
      [newId("cy_"), date, policy.id, policy.use_start, policy.use_end, policy.grace_minutes, policy.timezone, b.windowStart.toISOString(), b.windowEnd.toISOString(), b.deadline.toISOString(), nowIso()],
    );
  } catch (e) { if (!isUniqueViolation(e)) throw e; }
  return (await db.get<Cycle>(`SELECT * FROM deposit_cycles WHERE cycle_key = $1`, [date]))!;
}

/** Current cycle: an active demo cycle (deadline within the last 2h or upcoming) wins; otherwise the scheduled one. */
/** Short per-process cache (15 s) to save round trips; staleness is bounded and reset on policy/demo changes. */
let cycleCache: { at: number; value: Cycle } | null = null;
export function resetCycleCache() { cycleCache = null; }

export async function currentCycle(now = new Date()): Promise<Cycle> {
  if (cycleCache && Math.abs(now.getTime() - cycleCache.at) < 15_000) return cycleCache.value;
  const value = await loadCurrentCycle(now);
  cycleCache = { at: now.getTime(), value };
  return value;
}

async function loadCurrentCycle(now: Date): Promise<Cycle> {
  const db = getDb();
  const demo = await db.get<Cycle>(
    `SELECT * FROM deposit_cycles WHERE is_demo = 1 AND deadline > $1 ORDER BY created_at DESC LIMIT 1`,
    [new Date(now.getTime() - 2 * 3600_000).toISOString()],
  );
  if (demo) return demo;
  const p = await activePolicy();
  return ensureCycle(currentCycleDate(now, p), p);
}

/**
 * Idempotent overdue evaluation for every cycle whose deadline has passed (recent ones only).
 * Creates at most one alert per (student, cycle) thanks to the unique key.
 * Expected = active student with an active registered phone.
 * Compliant = custody receipt for that cycle, or phone in custody at deadline, or approved exception covering the deadline.
 */
export async function evaluateOverdue(now = new Date()): Promise<{ cyclesChecked: number; alertsCreated: number }> {
  const db = getDb();
  await currentCycle(now); // make sure today's/yesterday's cycle rows exist
  const cycles = await db.all<Cycle>(
    `SELECT * FROM deposit_cycles WHERE deadline <= $1 AND deadline > $2 ORDER BY deadline`,
    [now.toISOString(), new Date(now.getTime() - 36 * 3600_000).toISOString()],
  );
  let created = 0;
  const notifIds: string[] = [];
  const wardenRows = cycles.length ? await db.all<{ warden_id: string; hostel_id: string }>(`SELECT warden_id, hostel_id FROM warden_hostels`) : [];
  const missingSql = `SELECT u.id AS student_id, u.name, u.roll_no, u.room, u.hostel_id
           FROM users u JOIN phones p ON p.student_id = u.id AND p.active = 1
          WHERE u.role = 'student' AND u.active = 1 AND u.hostel_id IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM custody_receipts r WHERE r.student_id = u.id AND (r.cycle_id = $1 OR (r.deposited_at <= $2 AND (r.returned_at IS NULL OR r.returned_at > $2))))
            AND NOT EXISTS (SELECT 1 FROM exceptions e WHERE e.student_id = u.id AND e.status = 'approved' AND e.starts_at <= $2 AND e.expires_at > $2)
            AND NOT EXISTS (SELECT 1 FROM alerts a WHERE a.student_id = u.id AND a.cycle_id = $1)
            AND u.created_at <= $2`;
  type Missing = { student_id: string; name: string; roll_no: string; room: string; hostel_id: string };
  // Cheap check first (parallel, no transaction); only cycles with someone missing open a transaction.
  const pre = await Promise.all(cycles.map((c) => db.all<Missing>(missingSql, [c.id, c.deadline])));
  for (const [i, c] of cycles.entries()) {
    if (!pre[i].length) {
      if (!c.evaluated_at) await db.run(`UPDATE deposit_cycles SET evaluated_at = $2 WHERE id = $1`, [c.id, nowIso()]);
      continue;
    }
    await db.tx(async (tx) => {
      const missing = await tx.all<{ student_id: string; name: string; roll_no: string; room: string; hostel_id: string }>(
        `SELECT u.id AS student_id, u.name, u.roll_no, u.room, u.hostel_id
           FROM users u JOIN phones p ON p.student_id = u.id AND p.active = 1
          WHERE u.role = 'student' AND u.active = 1 AND u.hostel_id IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM custody_receipts r WHERE r.student_id = u.id AND (r.cycle_id = $1 OR (r.deposited_at <= $2 AND (r.returned_at IS NULL OR r.returned_at > $2))))
            AND NOT EXISTS (SELECT 1 FROM exceptions e WHERE e.student_id = u.id AND e.status = 'approved' AND e.starts_at <= $2 AND e.expires_at > $2)
            AND NOT EXISTS (SELECT 1 FROM alerts a WHERE a.student_id = u.id AND a.cycle_id = $1)
            AND u.created_at <= $2`,
        [c.id, c.deadline],
      );
      for (const m of missing) {
        const n = await tx.run(
          `INSERT INTO alerts (id, kind, student_id, cycle_id, status, created_at) VALUES ($1,'phone_not_deposited',$2,$3,'open',$4) ON CONFLICT (kind, student_id, cycle_id) DO NOTHING`,
          [newId("al_"), m.student_id, c.id, nowIso()],
        );
        if (!n) continue;
        created++;
        const deadlineLabel = fmtTime(c.deadline, c.timezone);
        notifIds.push(await persistNotification(tx, m.student_id, "overdue", "Phone not deposited by the deadline", `Deposit was due at ${deadlineLabel}. Please hand your phone to the warden.`));
        for (const w of wardenRows.filter((x) => x.hostel_id === m.hostel_id)) notifIds.push(await persistNotification(tx, w.warden_id, "overdue", "Phone not deposited by the deadline", `${m.name} — ${m.roll_no} — Room ${m.room}. Due ${deadlineLabel}.`));
        await audit(tx, { actorId: null, action: "alert.created", entityType: "alert", subjectUserId: m.student_id, detail: { cycle: c.cycle_key, deadline: c.deadline } });
      }
      if (!c.evaluated_at) await tx.run(`UPDATE deposit_cycles SET evaluated_at = $2 WHERE id = $1`, [c.id, nowIso()]);
    });
  }
  if (notifIds.length) await deliverPending(notifIds).catch((e) => console.error("[push]", e));
  return { cyclesChecked: cycles.length, alertsCreated: created };
}

export function fmtTime(iso: string, tz = "Asia/Kolkata") {
  return new Intl.DateTimeFormat("en-IN", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso)).toUpperCase();
}

// ---------------- Credentials ----------------
export async function issueCredential(tx: Tx, purpose: "attendance_join" | "deposit" | "collect", subjectId: string, issuedTo: string | null, ttlSec: number) {
  for (let i = 0; i < 5; i++) {
    const code = newCode();
    const id = newId("cr_");
    const expires = new Date(Date.now() + ttlSec * 1000).toISOString();
    const n = await tx.run(
      `INSERT INTO credentials (id, purpose, code, subject_id, issued_to, expires_at, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (code) DO NOTHING`,
      [id, purpose, code, subjectId, issuedTo, expires, nowIso()],
    );
    if (n) return { id, code, expiresAt: expires };
  }
  throw fail("SERVER_ERROR", "Could not issue a code. Try again.", 500);
}

export type CredentialRow = { id: string; purpose: string; code: string; subject_id: string; issued_to: string | null; expires_at: string; consumed_at: string | null; revoked_at: string | null };

export async function lookupCredential(code: string, purposes: string[], rateKey: string): Promise<CredentialRow> {
  await checkRateLimit(rateKey, 10, 600);
  const row = await getDb().get<CredentialRow>(`SELECT id, purpose, code, subject_id, issued_to, expires_at, consumed_at, revoked_at FROM credentials WHERE code = $1`, [code]);
  if (!row) { await recordFailure(rateKey, 600); throw fail("INVALID_CODE", "That code was not recognised. Check the letters and try again.", 404); }
  if (!purposes.includes(row.purpose)) { await recordFailure(rateKey, 600); throw fail("WRONG_PURPOSE", "This code is for a different action.", 400, { purpose: row.purpose }); }
  if (row.consumed_at) throw fail("ALREADY_USED", "This pass has already been used.", 409);
  if (row.revoked_at || new Date(row.expires_at) <= new Date()) throw fail("EXPIRED_CODE", "This code has expired. Ask for a fresh one.", 410);
  return row;
}
