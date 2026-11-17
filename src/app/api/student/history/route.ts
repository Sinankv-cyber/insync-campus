import { handle, ok, pageParams } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const GET = handle(async (req: Request) => {
  const u = await requireUser("student");
  const { limit, offset } = pageParams(new URL(req.url));
  const db = getDb();
  const [attendance, receipts, exceptions, alerts] = await Promise.all([
    db.all(`SELECT r.id, r.status, r.method, r.face_check, r.manual_reason, r.requested_at, r.decided_at, c.name AS class_name, c.subject_code, t.name AS teacher_name
              FROM attendance_records r JOIN attendance_sessions s ON s.id = r.session_id JOIN classes c ON c.id = s.class_id JOIN users t ON t.id = s.teacher_id
             WHERE r.student_id = $1 ORDER BY r.requested_at DESC, r.id LIMIT $2 OFFSET $3`, [u.id, limit, offset]),
    db.all(`SELECT r.id, r.storage_slot, r.deposited_at, r.deposit_method, r.returned_at, r.return_method, r.deposit_note, r.return_note, u1.name AS received_by_name, u2.name AS returned_by_name, p.description AS phone
              FROM custody_receipts r JOIN users u1 ON u1.id = r.received_by LEFT JOIN users u2 ON u2.id = r.returned_by JOIN phones p ON p.id = r.phone_id
             WHERE r.student_id = $1 ORDER BY r.deposited_at DESC, r.id LIMIT $2 OFFSET $3`, [u.id, limit, offset]),
    db.all(`SELECT e.id, e.reason, e.starts_at, e.expires_at, e.status, e.decision_note, e.created_at, d.name AS decided_by_name
              FROM exceptions e LEFT JOIN users d ON d.id = e.decided_by WHERE e.student_id = $1 ORDER BY e.created_at DESC LIMIT 10`, [u.id]),
    db.all(`SELECT a.id, a.status, a.created_at, a.resolved_at, c.deadline FROM alerts a JOIN deposit_cycles c ON c.id = a.cycle_id WHERE a.student_id = $1 ORDER BY a.created_at DESC LIMIT 10`, [u.id]),
  ]);
  return ok({ attendance, receipts, exceptions, alerts, limit, offset });
});
