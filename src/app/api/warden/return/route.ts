import { z } from "zod";
import { body, fail, handle, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { audit, deliverPending, fmtTime, persistNotification } from "@/lib/services";
import { studentCard } from "@/lib/warden";
import { nowIso } from "@/lib/util";

const Schema = z.object({
  credentialId: z.string().max(60).optional(),
  studentId: z.string().max(60).optional(),
  method: z.enum(["qr", "code", "id_lookup"]),
  identityVerified: z.literal(true),
  note: z.string().trim().max(200).optional(),
});

/** Record phone collection. The student does not need the deposited phone: ID lookup is first-class. */
export const POST = handle(async (req: Request) => {
  const u = await requireUser("warden", "admin");
  const input = await body(req, Schema);
  const db = getDb();
  const now = nowIso();
  let studentId = input.studentId;
  if (input.credentialId) {
    const c = await db.get<{ subject_id: string; purpose: string }>(`SELECT subject_id, purpose FROM credentials WHERE id = $1`, [input.credentialId]);
    if (!c) throw fail("INVALID_CODE", "Pass not found.", 404);
    if (c.purpose !== "collect") throw fail("WRONG_PURPOSE", "This pass is not a Collect Pass.", 400);
    studentId = c.subject_id;
  } else if (input.method !== "id_lookup" || !input.note) {
    throw fail("VALIDATION", "Without a pass, use ID lookup and record how identity was checked.");
  }
  if (!studentId) throw fail("VALIDATION", "Student is required.");
  const card = await studentCard(u, studentId);
  if (!card.active_receipt_id) throw fail("ALREADY_RETURNED", "No phone in custody — it was already returned.", 409);
  const notifIds: string[] = [];
  await db.tx(async (tx) => {
    if (input.credentialId) {
      const used = await tx.get(`UPDATE credentials SET consumed_at = $2, consumed_by = $3 WHERE id = $1 AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at > $2 RETURNING id`, [input.credentialId, now, u.id]);
      if (!used) throw fail("EXPIRED_CODE", "The pass expired or was already used. Use ID lookup instead.", 410);
    }
    const r = await tx.get(`UPDATE custody_receipts SET returned_at = $2, returned_by = $3, return_method = $4, return_note = $5 WHERE id = $1 AND returned_at IS NULL RETURNING id`,
      [card.active_receipt_id, now, u.id, input.method, input.note ?? null]);
    if (!r) throw fail("ALREADY_RETURNED", "This phone was already returned.", 409);
    await audit(tx, { actorId: u.id, action: "custody.returned", entityType: "custody_receipt", entityId: card.active_receipt_id, subjectUserId: studentId, detail: { method: input.method, note: input.note } });
    notifIds.push(await persistNotification(tx, studentId!, "return", "Phone returned to you", `Collected from Slot ${card.receipt_slot} at ${fmtTime(now)}, verified by ${u.name}.`));
  });
  deliverPending(notifIds).catch(() => {});
  return ok({ receiptId: card.active_receipt_id, returnedAt: now });
});
