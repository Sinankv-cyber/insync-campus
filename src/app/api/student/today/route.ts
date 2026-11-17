import { handle, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { currentCycle } from "@/lib/services";
import { custodyFor, cyclePublic } from "@/lib/custody";

export const GET = handle(async () => {
  const u = await requireUser("student");
  const db = getDb();
  const now = new Date();
  const cycle = await currentCycle(now);
  const [custody, recentAttendance, notifications, pendingPass] = await Promise.all([
    custodyFor([u.id], cycle, now),
    db.all(`SELECT r.id, r.status, r.method, r.requested_at, r.decided_at, c.name AS class_name, c.subject_code
              FROM attendance_records r JOIN attendance_sessions s ON s.id = r.session_id JOIN classes c ON c.id = s.class_id
             WHERE r.student_id = $1 ORDER BY r.requested_at DESC LIMIT 5`, [u.id]),
    db.all(`SELECT id, kind, title, body, created_at, read_at, push_status FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 8`, [u.id]),
    db.get(`SELECT id, purpose, code, expires_at FROM credentials WHERE issued_to = $1 AND purpose IN ('deposit','collect') AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at > $2 ORDER BY created_at DESC LIMIT 1`, [u.id, now.toISOString()]),
  ]);
  return ok({ serverTime: now.toISOString(), cycle: cyclePublic(cycle), custody: custody.get(u.id), recentAttendance, notifications, pendingPass: pendingPass ?? null });
});
