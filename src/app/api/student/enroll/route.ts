import { z } from "zod";
import { body, fail, handle, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { audit, checkRateLimit, persistNotification, deliverPending, recordFailure } from "@/lib/services";
import { normalizeCode, nowIso } from "@/lib/util";

/** Student requests to join a class using the teacher's unique class code. Teacher approval required. */
export const POST = handle(async (req: Request) => {
  const u = await requireUser("student");
  const { code } = await body(req, z.object({ code: z.string().min(4).max(40) }));
  const key = `enroll:${u.id}`;
  await checkRateLimit(key, 10, 600);
  const db = getDb();
  const cls = await db.get<{ id: string; name: string; teacher_id: string }>(`SELECT id, name, teacher_id FROM classes WHERE enroll_code = $1`, [normalizeCode(code)]);
  if (!cls) { await recordFailure(key, 600); throw fail("INVALID_CODE", "No class uses that code. Check it with your teacher.", 404); }
  const existing = await db.get<{ status: string }>(`SELECT status FROM class_enrollments WHERE class_id = $1 AND student_id = $2`, [cls.id, u.id]);
  if (existing && existing.status !== "rejected") return ok({ classId: cls.id, className: cls.name, status: existing.status, duplicate: true });
  const nid = await db.tx(async (tx) => {
    await tx.run(`INSERT INTO class_enrollments (class_id, student_id, status, requested_at) VALUES ($1,$2,'pending',$3)
                  ON CONFLICT (class_id, student_id) DO UPDATE SET status = 'pending', requested_at = $3, decided_at = NULL, decided_by = NULL`, [cls.id, u.id, nowIso()]);
    await audit(tx, { actorId: u.id, action: "enrollment.requested", entityType: "class", entityId: cls.id, subjectUserId: u.id });
    return persistNotification(tx, cls.teacher_id, "enrollment", "New class join request", `${u.name} asked to join ${cls.name}.`);
  });
  deliverPending([nid]).catch(() => {});
  return ok({ classId: cls.id, className: cls.name, status: "pending" });
});
