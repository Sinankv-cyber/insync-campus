import { z } from "zod";
import { body, fail, handle, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getDb, isUniqueViolation } from "@/lib/db";
import { resolveJoin } from "@/lib/attendance";
import { audit } from "@/lib/services";
import { newId, nowIso } from "@/lib/util";

const Schema = z.object({
  code: z.string().min(4).max(300),
  method: z.enum(["qr", "code"]),
  faceCheck: z.enum(["face_detected", "no_face", "not_checked"]).default("not_checked"),
  faceImage: z.string().max(90_000).regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/).optional(),
});

/** Creates an attendance request marked Pending verification. Never marks Present by itself. */
export const POST = handle(async (req: Request) => {
  const u = await requireUser("student");
  const input = await body(req, Schema);
  const r = await resolveJoin(u, input.code);
  if (r.existing) throw fail("ALREADY_JOINED", `You already joined this session (${r.existing.status === "pending" ? "awaiting teacher confirmation" : r.existing.status}).`, 409, { status: r.existing.status });
  const db = getDb();
  const id = newId("ar_");
  try {
    await db.tx(async (tx) => {
      await tx.run(
        `INSERT INTO attendance_records (id, session_id, student_id, status, method, face_check, face_image, requested_at) VALUES ($1,$2,$3,'pending',$4,$5,$6,$7)`,
        [id, r.session.id, u.id, input.method, input.faceCheck, input.faceImage ?? null, nowIso()]);
      await audit(tx, { actorId: u.id, action: "attendance.requested", entityType: "attendance_record", entityId: id, subjectUserId: u.id, detail: { session: r.session.id, method: input.method, faceCheck: input.faceCheck } });
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw fail("ALREADY_JOINED", "You already joined this session.", 409);
    throw e;
  }
  return ok({ recordId: id, status: "pending", className: r.session.class_name, teacherName: r.session.teacher_name });
});
