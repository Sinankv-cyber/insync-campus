import { z } from "zod";
import { body, fail, handle, ok } from "@/lib/api";
import { assertTeacherOwnsClass, requireUser } from "@/lib/auth";
import { getDb, isUniqueViolation } from "@/lib/db";
import { audit, issueCredential } from "@/lib/services";
import { newId, nowIso } from "@/lib/util";

const JOIN_TTL_SEC = 20 * 60;

export const POST = handle(async (req: Request) => {
  const u = await requireUser("teacher", "admin");
  const { classId } = await body(req, z.object({ classId: z.string().min(1).max(60) }));
  await assertTeacherOwnsClass(u, classId);
  const db = getDb();
  const id = newId("s_");
  try {
    await db.tx(async (tx) => {
      await tx.run(`INSERT INTO attendance_sessions (id, class_id, teacher_id, status, opened_at) VALUES ($1,$2,$3,'open',$4)`, [id, classId, u.id, nowIso()]);
      await issueCredential(tx, "attendance_join", id, null, JOIN_TTL_SEC);
      await audit(tx, { actorId: u.id, action: "session.opened", entityType: "attendance_session", entityId: id, detail: { classId } });
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw fail("CONFLICT", "A session is already open for this class.", 409);
    throw e;
  }
  return ok({ sessionId: id });
});
