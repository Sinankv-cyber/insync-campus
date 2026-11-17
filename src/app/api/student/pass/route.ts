import { z } from "zod";
import { body, fail, handle, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { audit, currentCycle, issueCredential } from "@/lib/services";
import { custodyFor } from "@/lib/custody";
import { nowIso } from "@/lib/util";

const PASS_TTL_SEC = 120;

/** Issue a short-lived, single-use, purpose-bound Deposit (or Collect) Pass. Requires the server: never issued offline. */
export const POST = handle(async (req: Request) => {
  const u = await requireUser("student");
  const { purpose } = await body(req, z.object({ purpose: z.enum(["deposit", "collect"]) }));
  const cycle = await currentCycle();
  const c = (await custodyFor([u.id], cycle)).get(u.id)!;
  if (!c.phone) throw fail("NO_PHONE", "No registered phone on your account. Ask the warden to register it.", 409);
  if (purpose === "deposit" && c.activeReceipt) throw fail("ALREADY_RECEIVED", "Your phone is already recorded as received by the warden.", 409);
  if (purpose === "collect" && !c.activeReceipt) throw fail("CONFLICT", "There is no phone in custody to collect.", 409);
  const db = getDb();
  const cred = await db.tx(async (tx) => {
    await tx.run(`UPDATE credentials SET revoked_at = $2 WHERE issued_to = $1 AND purpose IN ('deposit','collect') AND consumed_at IS NULL AND revoked_at IS NULL`, [u.id, nowIso()]);
    const cr = await issueCredential(tx, purpose, u.id, u.id, PASS_TTL_SEC);
    await audit(tx, { actorId: u.id, action: `pass.issued`, entityType: "credential", entityId: cr.id, subjectUserId: u.id, detail: { purpose } });
    return cr;
  });
  return ok({ ...cred, purpose, ttlSec: PASS_TTL_SEC, qrPayload: `HP${purpose === "deposit" ? "D" : "C"}:${cred.code}` });
});

/** Poll a pass: has staff confirmed it yet? */
export const GET = handle(async (req: Request) => {
  const u = await requireUser("student");
  const id = new URL(req.url).searchParams.get("id") || "";
  const db = getDb();
  const cr = await db.get<{ id: string; purpose: string; expires_at: string; consumed_at: string | null; revoked_at: string | null }>(
    `SELECT id, purpose, expires_at, consumed_at, revoked_at FROM credentials WHERE id = $1 AND issued_to = $2`, [id, u.id]);
  if (!cr) throw fail("NOT_FOUND", "Pass not found.", 404);
  let receipt = null;
  if (cr.consumed_at) {
    receipt = await db.get(
      `SELECT r.id, r.storage_slot, r.deposited_at, r.returned_at, r.deposit_method, r.return_method, u1.name AS received_by_name, u2.name AS returned_by_name, p.description AS phone
         FROM custody_receipts r JOIN users u1 ON u1.id = r.received_by LEFT JOIN users u2 ON u2.id = r.returned_by JOIN phones p ON p.id = r.phone_id
        WHERE r.student_id = $1 ORDER BY COALESCE(r.returned_at, r.deposited_at) DESC LIMIT 1`, [u.id]);
  }
  const state = cr.consumed_at ? "confirmed" : cr.revoked_at ? "revoked" : new Date(cr.expires_at) <= new Date() ? "expired" : "waiting";
  return ok({ state, purpose: cr.purpose, expiresAt: cr.expires_at, receipt });
});
