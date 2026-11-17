import { z } from "zod";
import { body, fail, handle, ok } from "@/lib/api";
import { assertTeacherOwnsClass, requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { audit, deliverPending, persistNotification } from "@/lib/services";
import { nowIso } from "@/lib/util";

export const POST = handle(async (req: Request) => {
  const u = await requireUser("teacher", "admin");
  const input = await body(req, z.object({ classId: z.string().min(1).max(60), studentId: z.string().min(1).max(60), decision: z.enum(["approved", "rejected"]) }));
  await assertTeacherOwnsClass(u, input.classId);
  const db = getDb();
  const nid = await db.tx(async (tx) => {
    const n = await tx.run(`UPDATE class_enrollments SET status = $3, decided_at = $4, decided_by = $5 WHERE class_id = $1 AND student_id = $2 AND status = 'pending'`,
      [input.classId, input.studentId, input.decision, nowIso(), u.id]);
    if (!n) throw fail("CONFLICT", "This request was already decided.", 409);
    await audit(tx, { actorId: u.id, action: `enrollment.${input.decision}`, entityType: "class", entityId: input.classId, subjectUserId: input.studentId });
    const c = await tx.get<{ name: string }>(`SELECT name FROM classes WHERE id = $1`, [input.classId]);
    return persistNotification(tx, input.studentId, "enrollment", input.decision === "approved" ? "Class joined" : "Class request declined", `${c?.name}: ${input.decision === "approved" ? "your teacher approved your request." : "your teacher declined your request."}`);
  });
  deliverPending([nid]).catch(() => {});
  return ok({ decision: input.decision });
});
