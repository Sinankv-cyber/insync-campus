import { z } from "zod";
import { body, handle, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { activePolicy, audit, resetCycleCache } from "@/lib/services";
import { newId, nowIso } from "@/lib/util";

/** Short, clearly-labelled demo deadline. Real alert logic runs against it unchanged. */
export const POST = handle(async (req: Request) => {
  const admin = await requireUser("admin");
  const { minutes, graceMinutes } = await body(req, z.object({ minutes: z.number().int().min(1).max(60), graceMinutes: z.number().int().min(0).max(10).default(1) }));
  const p = await activePolicy();
  const now = new Date();
  const end = new Date(now.getTime() + minutes * 60000);
  const deadline = new Date(end.getTime() + graceMinutes * 60000);
  const id = newId("cy_");
  const db = getDb();
  await db.tx(async (tx) => {
    await tx.run(`INSERT INTO deposit_cycles (id, cycle_key, is_demo, policy_version_id, use_start, use_end, grace_minutes, timezone, window_start, window_end, deadline, created_at) VALUES ($1,$2,1,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [id, `demo-${now.toISOString()}`, p.id, "demo", "demo", graceMinutes, p.timezone, now.toISOString(), end.toISOString(), deadline.toISOString(), nowIso()]);
    await audit(tx, { actorId: admin.id, action: "cycle.demo_started", entityType: "deposit_cycle", entityId: id, detail: { minutes, graceMinutes, deadline: deadline.toISOString() } });
  });
  resetCycleCache();
  return ok({ id, windowEnd: end.toISOString(), deadline: deadline.toISOString() });
});

/** End any active demo cycle so the scheduled policy applies again. */
export const DELETE = handle(async () => {
  const admin = await requireUser("admin");
  const db = getDb();
  const cutoff = new Date(Date.now() - 3 * 3600_000).toISOString();
  await db.tx(async (tx) => {
    await tx.run(`UPDATE deposit_cycles SET deadline = $1, window_end = $1 WHERE is_demo = 1 AND deadline > $1`, [cutoff]);
    await audit(tx, { actorId: admin.id, action: "cycle.demo_ended", entityType: "deposit_cycle" });
  });
  resetCycleCache();
  return ok({ ended: true });
});
