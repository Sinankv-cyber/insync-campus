import { z } from "zod";
import { body, fail, handle, ok } from "@/lib/api";
import { assertTeacherOwnsClass, requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { audit, deliverPending, persistNotification } from "@/lib/services";
import { newId, nowIso } from "@/lib/util";

const Schema = z.object({
  sessionId: z.string().min(1).max(60),
  studentIds: z.array(z.string().min(1).max(60)).min(1).max(100),
  status: z.enum(["present", "late", "absent", "excused"]),
  manualReason: z.string().trim().max(200).optional(),
});

/** Teacher confirms physical presence. Manual entry (no request from the student) needs a reason. */
export const POST = handle(async (req: Request) => {
  const u = await requireUser("teacher", "admin");
  const input = await body(req, Schema);
  const db = getDb();
  const s = await db.get<{ id: string; class_id: string; status: string; class_name: string }>(
    `SELECT s.id, s.class_id, s.status, c.name AS class_name FROM attendance_sessions s JOIN classes c ON c.id = s.class_id WHERE s.id = $1`, [input.sessionId]);
  if (!s) throw fail("NOT_FOUND", "Session not found.", 404);
  await assertTeacherOwnsClass(u, s.class_id);
  if (s.status === "finalized") throw fail("CONFLICT", "This session is finalized; records are locked.", 409);
  const ph = input.studentIds.map((_, i) => `$${i + 2}`).join(",");
  const enrolled = await db.all<{ student_id: string }>(`SELECT student_id FROM class_enrollments WHERE class_id = $1 AND status = 'approved' AND student_id IN (${ph})`, [s.class_id, ...input.studentIds]);
  if (enrolled.length !== new Set(input.studentIds).size) throw fail("FORBIDDEN", "One or more students are not enrolled in this class.", 403);
  const now = nowIso();
  const notifIds: string[] = [];
  const result = await db.tx(async (tx) => {
    let updated = 0, manual = 0;
    for (const sid of input.studentIds) {
      const existing = await tx.get<{ id: string; status: string }>(`SELECT id, status FROM attendance_records WHERE session_id = $1 AND student_id = $2`, [s.id, sid]);
      if (existing) {
        await tx.run(`UPDATE attendance_records SET status = $2, decided_by = $3, decided_at = $4 WHERE id = $1`, [existing.id, input.status, u.id, now]);
        await audit(tx, { actorId: u.id, action: "attendance.confirmed", entityType: "attendance_record", entityId: existing.id, subjectUserId: sid, detail: { from: existing.status, to: input.status } });
      } else {
        if (!input.manualReason) throw fail("VALIDATION", "Manual entry needs a reason (e.g. 'No working device').");
        const id = newId("ar_");
        await tx.run(`INSERT INTO attendance_records (id, session_id, student_id, status, method, manual_reason, requested_at, decided_by, decided_at) VALUES ($1,$2,$3,$4,'manual',$5,$6,$7,$6)`,
          [id, s.id, sid, input.status, input.manualReason, now, u.id]);
        await audit(tx, { actorId: u.id, action: "attendance.manual_entry", entityType: "attendance_record", entityId: id, subjectUserId: sid, detail: { status: input.status, reason: input.manualReason } });
        manual++;
      }
      notifIds.push(await persistNotification(tx, sid, "attendance", `Attendance: ${input.status[0].toUpperCase()}${input.status.slice(1)}`, `${s.class_name} — confirmed by ${u.name}.`));
      updated++;
    }
    return { updated, manual };
  });
  deliverPending(notifIds).catch(() => {});
  return ok(result);
});
