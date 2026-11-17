import { z } from "zod";
import { body, fail, handle, ok } from "@/lib/api";
import { assertWardenScope, requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { audit, deliverPending, persistNotification } from "@/lib/services";
import { nowIso } from "@/lib/util";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (req: Request, ctx: Ctx) => {
  const u = await requireUser("warden", "admin");
  const { id } = await ctx.params;
  const input = await body(req, z.object({ decision: z.enum(["approved", "rejected", "revoked"]), note: z.string().trim().max(200).optional() }));
  const db = getDb();
  const ex = await db.get<{ student_id: string; status: string; reason: string }>(`SELECT student_id, status, reason FROM exceptions WHERE id = $1`, [id]);
  if (!ex) throw fail("NOT_FOUND", "Exception not found.", 404);
  await assertWardenScope(u, ex.student_id);
  const from = input.decision === "revoked" ? "approved" : "pending";
  const nid = await db.tx(async (tx) => {
    const n = await tx.run(`UPDATE exceptions SET status = $2, decided_by = $3, decided_at = $4, decision_note = $5 WHERE id = $1 AND status = $6`, [id, input.decision, u.id, nowIso(), input.note ?? null, from]);
    if (!n) throw fail("CONFLICT", "This exception was already decided.", 409);
    await audit(tx, { actorId: u.id, action: `exception.${input.decision}`, entityType: "exception", entityId: id, subjectUserId: ex.student_id, detail: { note: input.note } });
    return persistNotification(tx, ex.student_id, "exception", `Exception ${input.decision}`, `${ex.reason}${input.note ? ` — ${input.note}` : ""}`);
  });
  deliverPending([nid]).catch(() => {});
  return ok({ status: input.decision });
});
