import { z } from "zod";
import { body, fail, handle, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getDb, isUniqueViolation } from "@/lib/db";
import { audit, currentCycle, deliverPending, fmtTime, persistNotification } from "@/lib/services";
import { studentCard } from "@/lib/warden";
import { newId, nowIso } from "@/lib/util";

const Schema = z.object({
  credentialId: z.string().max(60).optional(),
  studentId: z.string().max(60).optional(),
  method: z.enum(["qr", "code", "id_lookup"]),
  note: z.string().trim().max(200).optional(),
  physicallyChecked: z.literal(true),
});

/**
 * Staff confirmation is the ONLY way a phone becomes recorded custody.
 * One transaction: consume single-use pass (if any) + receipt + resolve alerts + audit + notifications.
 * Retry-safe: a repeated confirm returns ALREADY_RECEIVED instead of creating a second record.
 */
export const POST = handle(async (req: Request) => {
  const u = await requireUser("warden", "admin");
  const input = await body(req, Schema);
  const db = getDb();
  const now = nowIso();
  let studentId = input.studentId;
  if (input.credentialId) {
    const c = await db.get<{ subject_id: string; purpose: string }>(`SELECT subject_id, purpose FROM credentials WHERE id = $1`, [input.credentialId]);
    if (!c) throw fail("INVALID_CODE", "Pass not found.", 404);
    if (c.purpose !== "deposit") throw fail("WRONG_PURPOSE", "This pass is not a Deposit Pass.", 400);
    studentId = c.subject_id;
  } else if (input.method !== "id_lookup" || !input.note) {
    throw fail("VALIDATION", "Without a pass, use ID lookup and record a reason.");
  }
  if (!studentId) throw fail("VALIDATION", "Student is required.");
  const card = await studentCard(u, studentId);
  if (!card.phone_id) throw fail("NO_PHONE", "No registered phone for this student.", 409);
  const cycle = await currentCycle();
  const notifIds: string[] = [];
  const receiptId = newId("rc_");
  try {
    await db.tx(async (tx) => {
      if (input.credentialId) {
        const used = await tx.get(`UPDATE credentials SET consumed_at = $2, consumed_by = $3 WHERE id = $1 AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at > $2 RETURNING id`, [input.credentialId, now, u.id]);
        if (!used) {
          const c = await tx.get<{ consumed_at: string | null }>(`SELECT consumed_at FROM credentials WHERE id = $1`, [input.credentialId]);
          throw c?.consumed_at ? fail("ALREADY_USED", "This pass was already used.", 409) : fail("EXPIRED_CODE", "The pass expired before confirmation. Ask the student to open a fresh pass, or use ID lookup.", 410);
        }
      }
      await tx.run(
        `INSERT INTO custody_receipts (id, phone_id, student_id, cycle_id, storage_slot, deposited_at, received_by, deposit_method, deposit_note, credential_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [receiptId, card.phone_id, studentId, cycle.id, card.storage_slot, now, u.id, input.method, input.note ?? null, input.credentialId ?? null]);
      const resolved = await tx.run(`UPDATE alerts SET status = 'resolved', resolved_at = $2, resolved_receipt_id = $3 WHERE student_id = $1 AND status = 'open'`, [studentId, now, receiptId]);
      await audit(tx, { actorId: u.id, action: "custody.deposit_confirmed", entityType: "custody_receipt", entityId: receiptId, subjectUserId: studentId, detail: { method: input.method, slot: card.storage_slot, alertsResolved: resolved, note: input.note } });
      notifIds.push(await persistNotification(tx, studentId!, "receipt", `Phone received, Slot ${card.storage_slot}`, `Received by ${u.name} at ${fmtTime(now, cycle.timezone)}.`));
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw fail("ALREADY_RECEIVED", "This phone is already recorded as received.", 409);
    throw e;
  }
  deliverPending(notifIds).catch(() => {});
  return ok({ receiptId, storageSlot: card.storage_slot, depositedAt: now, student: { name: card.name, roll_no: card.roll_no, room: card.room } });
});
