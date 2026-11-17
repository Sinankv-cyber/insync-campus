import "server-only";
import { getDb } from "./db";
import type { Cycle } from "./services";

export type CustodyStatus = "in_custody" | "with_student" | "overdue" | "exempt" | "no_phone";

export type StudentCustody = {
  status: CustodyStatus;
  phone: { id: string; description: string; storage_slot: string } | null;
  activeReceipt: { id: string; deposited_at: string; storage_slot: string; received_by_name: string; deposit_method: string } | null;
  exception: { id: string; reason: string; expires_at: string; status: string } | null;
  openAlert: { id: string; created_at: string } | null;
  depositedThisCycle: boolean;
};

/** Custody state for many students in a fixed number of queries (no per-row queries). */
export async function custodyFor(studentIds: string[], cycle: Cycle, now = new Date()): Promise<Map<string, StudentCustody>> {
  const out = new Map<string, StudentCustody>();
  if (!studentIds.length) return out;
  const db = getDb();
  const ph = studentIds.map((_, i) => `$${i + 1}`).join(",");
  const n = studentIds.length;
  const [phones, receipts, exceptions, alerts, cycleReceipts] = await Promise.all([
    db.all<{ id: string; student_id: string; description: string; storage_slot: string }>(`SELECT id, student_id, description, storage_slot FROM phones WHERE active = 1 AND student_id IN (${ph})`, studentIds),
    db.all<{ id: string; student_id: string; deposited_at: string; storage_slot: string; received_by_name: string; deposit_method: string }>(
      `SELECT r.id, r.student_id, r.deposited_at, r.storage_slot, u.name AS received_by_name, r.deposit_method
         FROM custody_receipts r JOIN users u ON u.id = r.received_by WHERE r.returned_at IS NULL AND r.student_id IN (${ph})`, studentIds),
    db.all<{ id: string; student_id: string; reason: string; expires_at: string; status: string }>(
      `SELECT id, student_id, reason, expires_at, status FROM exceptions WHERE status IN ('approved','pending') AND expires_at > $${n + 1} AND student_id IN (${ph}) ORDER BY created_at DESC`, [...studentIds, now.toISOString()]),
    db.all<{ id: string; student_id: string; created_at: string }>(`SELECT id, student_id, created_at FROM alerts WHERE status = 'open' AND student_id IN (${ph}) ORDER BY created_at DESC`, studentIds),
    db.all<{ student_id: string }>(`SELECT DISTINCT student_id FROM custody_receipts WHERE cycle_id = $${n + 1} AND student_id IN (${ph})`, [...studentIds, cycle.id]),
  ]);
  const byStudent = <T extends { student_id: string }>(rows: T[]) => { const m = new Map<string, T>(); for (const r of rows) if (!m.has(r.student_id)) m.set(r.student_id, r); return m; };
  const P = byStudent(phones), R = byStudent(receipts), A = byStudent(alerts);
  const E = new Map<string, (typeof exceptions)[number]>();
  for (const e of exceptions) { const cur = E.get(e.student_id); if (!cur || (cur.status !== "approved" && e.status === "approved")) E.set(e.student_id, e); }
  const C = new Set(cycleReceipts.map((r) => r.student_id));
  for (const id of studentIds) {
    const phone = P.get(id) ?? null;
    const rec = R.get(id) ?? null;
    const ex = E.get(id) ?? null;
    const alert = A.get(id) ?? null;
    const exemptNow = ex?.status === "approved";
    let status: CustodyStatus;
    if (!phone) status = "no_phone";
    else if (rec) status = "in_custody";
    else if (exemptNow) status = "exempt";
    else if (alert || now >= new Date(cycle.deadline)) status = "overdue";
    else status = "with_student";
    out.set(id, {
      status, phone: phone ? { id: phone.id, description: phone.description, storage_slot: phone.storage_slot } : null,
      activeReceipt: rec ? { id: rec.id, deposited_at: rec.deposited_at, storage_slot: rec.storage_slot, received_by_name: rec.received_by_name, deposit_method: rec.deposit_method } : null,
      exception: ex ? { id: ex.id, reason: ex.reason, expires_at: ex.expires_at, status: ex.status } : null,
      openAlert: alert ? { id: alert.id, created_at: alert.created_at } : null,
      depositedThisCycle: C.has(id),
    });
  }
  return out;
}

export function cyclePublic(c: Cycle) {
  return { id: c.id, key: c.cycle_key, isDemo: Boolean(Number(c.is_demo)), useStart: c.use_start, useEnd: c.use_end, graceMinutes: Number(c.grace_minutes), timezone: c.timezone, windowStart: c.window_start, windowEnd: c.window_end, deadline: c.deadline };
}
