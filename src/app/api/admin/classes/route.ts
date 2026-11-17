import { z } from "zod";
import { body, fail, handle, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getDb, isUniqueViolation } from "@/lib/db";
import { audit } from "@/lib/services";
import { newCode, newId, nowIso } from "@/lib/util";

export const POST = handle(async (req: Request) => {
  const admin = await requireUser("admin");
  const input = await body(req, z.object({ classId: z.string().max(60).optional(), name: z.string().trim().min(2).max(120).optional(), subjectCode: z.string().trim().min(2).max(20).optional(), teacherId: z.string().min(1).max(60) }));
  const db = getDb();
  const t = await db.get(`SELECT 1 AS x FROM users WHERE id = $1 AND role = 'teacher' AND active = 1`, [input.teacherId]);
  if (!t) throw fail("VALIDATION", "Choose an active teacher.");
  if (input.classId) {
    await db.tx(async (tx) => {
      const n = await tx.run(`UPDATE classes SET teacher_id = $2 WHERE id = $1`, [input.classId, input.teacherId]);
      if (!n) throw fail("NOT_FOUND", "Class not found.", 404);
      await audit(tx, { actorId: admin.id, action: "class.reassigned", entityType: "class", entityId: input.classId, detail: { teacherId: input.teacherId } });
    });
    return ok({ id: input.classId });
  }
  if (!input.name || !input.subjectCode) throw fail("VALIDATION", "Name and subject code are required.");
  const id = newId("c_");
  try {
    await db.tx(async (tx) => {
      await tx.run(`INSERT INTO classes (id, name, subject_code, enroll_code, teacher_id, created_at) VALUES ($1,$2,$3,$4,$5,$6)`, [id, input.name, input.subjectCode, newCode(), input.teacherId, nowIso()]);
      await audit(tx, { actorId: admin.id, action: "class.created", entityType: "class", entityId: id, detail: { name: input.name } });
    });
  } catch (e) { if (isUniqueViolation(e)) throw fail("CONFLICT", "Try again.", 409); throw e; }
  return ok({ id });
});
