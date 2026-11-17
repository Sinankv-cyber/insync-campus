import { z } from "zod";
import { body, fail, handle, ok } from "@/lib/api";
import { assertWardenScope, requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { audit, deliverPending, persistNotification } from "@/lib/services";
import { newId, nowIso } from "@/lib/util";

const Schema = z.object({
  studentId: z.string().max(60).optional(),
  reason: z.string().trim().min(5).max(300),
  startsAt: z.string().datetime({ offset: true }).optional(),
  expiresAt: z.string().datetime({ offset: true }),
});

/** Time-limited exception. Students request; wardens/admins create (approved by them, audited). */
export const POST = handle(async (req: Request) => {
  const u = await requireUser("student", "warden", "admin");
  const input = await body(req, Schema);
  const starts = input.startsAt ? new Date(input.startsAt) : new Date();
  const expires = new Date(input.expiresAt);
  if (expires <= starts) throw fail("VALIDATION", "Expiry must be after the start.");
  if (expires.getTime() - starts.getTime() > 14 * 86400_000) throw fail("VALIDATION", "Exceptions can last at most 14 days.");
  const staff = u.role !== "student";
  const studentId = staff ? input.studentId : u.id;
  if (!studentId) throw fail("VALIDATION", "Choose a student.");
  if (staff) await assertWardenScope(u, studentId);
  const db = getDb();
  const id = newId("ex_");
  const now = nowIso();
  const notif: string[] = [];
  await db.tx(async (tx) => {
    await tx.run(`INSERT INTO exceptions (id, student_id, reason, starts_at, expires_at, status, requested_by, decided_by, decided_at, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [id, studentId, input.reason, starts.toISOString(), expires.toISOString(), staff ? "approved" : "pending", u.id, staff ? u.id : null, staff ? now : null, now]);
    await audit(tx, { actorId: u.id, action: staff ? "exception.granted" : "exception.requested", entityType: "exception", entityId: id, subjectUserId: studentId, detail: { reason: input.reason, expiresAt: expires.toISOString() } });
    if (staff) notif.push(await persistNotification(tx, studentId, "exception", "Exception approved", `${input.reason} — until ${expires.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}.`));
    else {
      const wardens = await tx.all<{ warden_id: string }>(`SELECT wh.warden_id FROM warden_hostels wh JOIN users s ON s.hostel_id = wh.hostel_id WHERE s.id = $1`, [studentId]);
      for (const w of wardens) notif.push(await persistNotification(tx, w.warden_id, "exception", "Exception request", `${u.name}: ${input.reason}`));
    }
  });
  deliverPending(notif).catch(() => {});
  return ok({ id, status: staff ? "approved" : "pending" });
});
