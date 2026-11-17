import { handle, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const GET = handle(async () => {
  const u = await requireUser("teacher", "admin");
  const db = getDb();
  const where = u.role === "admin" ? "" : "WHERE c.teacher_id = $1";
  const params = u.role === "admin" ? [] : [u.id];
  const classes = await db.all<{ id: string }>(
    `SELECT c.id, c.name, c.subject_code, c.enroll_code, t.name AS teacher_name,
            (SELECT COUNT(*) FROM class_enrollments e WHERE e.class_id = c.id AND e.status = 'approved') AS enrolled,
            (SELECT s.id FROM attendance_sessions s WHERE s.class_id = c.id AND s.status IN ('open','closed') ORDER BY s.opened_at DESC LIMIT 1) AS active_session_id
       FROM classes c JOIN users t ON t.id = c.teacher_id ${where} ORDER BY c.name LIMIT 25`, params);
  const ids = classes.map((c) => c.id);
  const pending = ids.length
    ? await db.all(`SELECT e.class_id, e.student_id, e.requested_at, u.name, u.email, u.roll_no FROM class_enrollments e JOIN users u ON u.id = e.student_id
                     WHERE e.status = 'pending' AND e.class_id IN (${ids.map((_, i) => `$${i + 1}`).join(",")}) ORDER BY e.requested_at LIMIT 50`, ids)
    : [];
  const recent = ids.length
    ? await db.all(`SELECT s.id, s.class_id, s.status, s.opened_at, s.finalized_at,
                           SUM(CASE WHEN r.status IN ('present','late') THEN 1 ELSE 0 END) AS present_count, COUNT(r.id) AS total
                      FROM attendance_sessions s LEFT JOIN attendance_records r ON r.session_id = s.id
                     WHERE s.class_id IN (${ids.map((_, i) => `$${i + 1}`).join(",")}) GROUP BY s.id, s.class_id, s.status, s.opened_at, s.finalized_at ORDER BY s.opened_at DESC LIMIT 10`, ids)
    : [];
  return ok({ classes, pending, recent });
});
