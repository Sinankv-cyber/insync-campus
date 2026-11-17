import { z } from "zod";
import { body, fail, handle, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { lookupCredential } from "@/lib/services";
import { studentCard } from "@/lib/warden";
import { isWellFormedCode, normalizeCode } from "@/lib/util";

/** Resolve a scanned QR or typed code to a preview. Does NOT change custody. */
export const POST = handle(async (req: Request) => {
  const u = await requireUser("warden", "admin");
  const { code: raw } = await body(req, z.object({ code: z.string().min(4).max(300) }));
  const code = normalizeCode(raw);
  if (!isWellFormedCode(code)) throw fail("INVALID_CODE", "Codes are 8 letters/numbers. Check for typos.", 400);
  const cred = await lookupCredential(code, ["deposit", "collect"], `wcode:${u.id}`);
  const student = await studentCard(u, cred.subject_id);
  if (cred.purpose === "deposit" && student.active_receipt_id) throw fail("ALREADY_RECEIVED", "This phone is already recorded as received.", 409);
  if (cred.purpose === "collect" && !student.active_receipt_id) throw fail("CONFLICT", "No phone in custody for this student.", 409);
  return ok({ credentialId: cred.id, purpose: cred.purpose, expiresAt: cred.expires_at, student });
});
