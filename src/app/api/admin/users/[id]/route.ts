import { z } from "zod";
import { body, fail, handle, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getDb, isUniqueViolation } from "@/lib/db";
import { audit } from "@/lib/services";
import { newId, nowIso } from "@/lib/util";

type Ctx = { params: Promise<{ id: string }> };
const Patch = z.object({
  role: z.enum(["student", "teacher", "warden", "admin"]).optional(),
  active: z.boolean().optional(),
  rollNo: z.string().trim().max(20).nullable().optional(),
  hostelId: z.string().max(60).nullable().optional(),
  room: z.string().trim().max(20).nullable().optional(),
  phone: z.object({ description: z.string().trim().min(3).max(120), storageSlot: z.string().trim().min(1).max(20) }).optional(),
  wardenHostelId: z.string().max(60).optional(),
});

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const admin = await requireUser("admin");
  const { id } = await ctx.params;
  const input = await body(req, Patch);
  const db = getDb();
  const u = await db.get<{ id: string; role: string }>(`SELECT id, role FROM users WHERE id = $1`, [id]);
  if (!u) throw fail("NOT_FOUND", "User not found.", 404);
  if (id === admin.id && (input.role && input.role !== "admin" || input.active === false)) throw fail("FORBIDDEN", "You cannot remove your own admin access.", 403);
  try {
    await db.tx(async (tx) => {
      const sets: string[] = []; const p: unknown[] = [id];
      const set = (col: string, v: unknown) => { p.push(v); sets.push(`${col} = $${p.length}`); };
      if (input.role) set("role", input.role);
      if (input.active !== undefined) set("active", input.active ? 1 : 0);
      if (input.rollNo !== undefined) set("roll_no", input.rollNo || null);
      if (input.hostelId !== undefined) set("hostel_id", input.hostelId || null);
      if (input.room !== undefined) set("room", input.room || null);
      if (sets.length) await tx.run(`UPDATE users SET ${sets.join(", ")} WHERE id = $1`, p);
      if (input.phone) {
        const active = await tx.get<{ id: string }>(`SELECT p.id FROM phones p WHERE p.student_id = $1 AND p.active = 1`, [id]);
        if (active) {
          const inCustody = await tx.get(`SELECT 1 AS x FROM custody_receipts WHERE phone_id = $1 AND returned_at IS NULL`, [active.id]);
          if (inCustody) throw fail("CONFLICT", "Return the phone in custody before replacing the registered phone.", 409);
          await tx.run(`UPDATE phones SET active = 0 WHERE id = $1`, [active.id]);
        }
        await tx.run(`INSERT INTO phones (id, student_id, description, storage_slot, active, created_at) VALUES ($1,$2,$3,$4,1,$5)`, [newId("ph_"), id, input.phone.description, input.phone.storageSlot, nowIso()]);
      }
      if (input.wardenHostelId) await tx.run(`INSERT INTO warden_hostels (warden_id, hostel_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [id, input.wardenHostelId]);
      await audit(tx, { actorId: admin.id, action: "user.updated", entityType: "user", entityId: id, subjectUserId: id, detail: input as Record<string, unknown> });
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw fail("CONFLICT", "Roll number already used.", 409);
    throw e;
  }
  return ok({ updated: true });
});
