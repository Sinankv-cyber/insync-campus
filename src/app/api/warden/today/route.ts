import { handle, ok, pageParams } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { currentCycle, evaluateOverdue } from "@/lib/services";
import { custodyFor, cyclePublic } from "@/lib/custody";

/** Warden dashboard. Reconciles overdue status on every refresh (recovery path in addition to the server scheduler). */
export const GET = handle(async (req: Request) => {
  const u = await requireUser("warden", "admin");
  const url = new URL(req.url);
  const { limit, offset } = pageParams(url);
  const q = (url.searchParams.get("q") || "").trim().toLowerCase().slice(0, 60);
  const filter = url.searchParams.get("filter") || "all";
  const now = new Date();
  const evaluation = await evaluateOverdue(now);
  const cycle = await currentCycle(now);
  const db = getDb();
  const scopeSql = u.role === "admin" ? "" : `AND u.hostel_id IN (SELECT hostel_id FROM warden_hostels WHERE warden_id = $1)`;
  const scopeParams = u.role === "admin" ? [] : [u.id];
  // All students in scope (single college ~ hundreds) -> counts; page the visible list.
  const students = await db.all<{ id: string; name: string; roll_no: string; room: string }>(
    `SELECT u.id, u.name, u.roll_no, u.room FROM users u WHERE u.role = 'student' AND u.active = 1 AND u.hostel_id IS NOT NULL ${scopeSql} ORDER BY u.roll_no LIMIT 2000`, scopeParams);
  const custody = await custodyFor(students.map((s) => s.id), cycle, now);
  const counts = { expected: 0, deposited: 0, due: 0, overdue: 0, exempt: 0, noPhone: 0 };
  for (const s of students) {
    const c = custody.get(s.id)!;
    if (c.status === "no_phone") { counts.noPhone++; continue; }
    counts.expected++;
    if (c.status === "in_custody") counts.deposited++;
    else if (c.status === "overdue") counts.overdue++;
    else if (c.status === "exempt") counts.exempt++;
    else counts.due++;
  }
  let list = students.map((s) => ({ ...s, custody: custody.get(s.id)! }));
  if (q) list = list.filter((s) => s.name.toLowerCase().includes(q) || (s.roll_no || "").toLowerCase().includes(q) || (s.room || "").toLowerCase() === q);
  if (filter !== "all") list = list.filter((s) => (filter === "due" ? s.custody.status === "with_student" : s.custody.status === filter));
  const total = list.length;
  const page = list.slice(offset, offset + limit);
  const alertScope = u.role === "admin" ? "" : `AND s.hostel_id IN (SELECT hostel_id FROM warden_hostels WHERE warden_id = $1)`;
  const alertCols = `a.id, a.status, a.created_at, a.resolved_at, s.id AS student_id, s.name, s.roll_no, s.room, c.deadline, c.is_demo
              FROM alerts a JOIN users s ON s.id = a.student_id JOIN deposit_cycles c ON c.id = a.cycle_id`;
  const [openAlerts, resolvedAlerts, exceptionRequests, recentReceipts] = await Promise.all([
    db.all(`SELECT ${alertCols} WHERE a.status = 'open' ${alertScope} ORDER BY a.created_at DESC, s.roll_no LIMIT 100`, scopeParams),
    db.all(`SELECT ${alertCols} WHERE a.status = 'resolved' AND a.resolved_at > $${scopeParams.length + 1} ${alertScope} ORDER BY a.resolved_at DESC LIMIT 25`,
      [...scopeParams, new Date(now.getTime() - 12 * 3600_000).toISOString()]),
    db.all(`SELECT e.id, e.reason, e.starts_at, e.expires_at, e.status, e.created_at, s.id AS student_id, s.name, s.roll_no, s.room
              FROM exceptions e JOIN users s ON s.id = e.student_id WHERE e.status = 'pending' AND e.expires_at > $${scopeParams.length + 1} ${alertScope} ORDER BY e.created_at LIMIT 25`,
      [...scopeParams, now.toISOString()]),
    db.all(`SELECT r.id, r.deposited_at, r.returned_at, r.deposit_method, r.return_method, r.storage_slot, s.name, s.roll_no, s.room
              FROM custody_receipts r JOIN users s ON s.id = r.student_id WHERE 1=1 ${alertScope} ORDER BY COALESCE(r.returned_at, r.deposited_at) DESC LIMIT 8`, scopeParams),
  ]);
  const alerts = [...openAlerts, ...resolvedAlerts];
  return ok({ serverTime: now.toISOString(), cycle: cyclePublic(cycle), counts, students: page, total, limit, offset, alerts, exceptionRequests, recentReceipts, evaluation });
});
