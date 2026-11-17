import { z } from "zod";
import { body, fail, handle, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { audit, resetCycleCache } from "@/lib/services";
import { isValidHHMM, isValidTimeZone } from "@/lib/schedule";
import { newId, nowIso } from "@/lib/util";

/** New policy version. Existing cycles keep their own snapshot; new cycles use this version. */
export const POST = handle(async (req: Request) => {
  const admin = await requireUser("admin");
  const input = await body(req, z.object({ useStart: z.string(), useEnd: z.string(), graceMinutes: z.number().int().min(0).max(240), timezone: z.string().max(60).default("Asia/Kolkata") }));
  if (!isValidHHMM(input.useStart) || !isValidHHMM(input.useEnd)) throw fail("VALIDATION", "Times must be HH:MM (24-hour).");
  if (input.useStart === input.useEnd) throw fail("VALIDATION", "Start and end cannot be the same.");
  if (!isValidTimeZone(input.timezone)) throw fail("VALIDATION", "Unknown time zone.");
  const db = getDb();
  const v = await db.tx(async (tx) => {
    const cur = await tx.get<{ v: number }>(`SELECT MAX(version) AS v FROM policy_versions`);
    const version = Number(cur?.v || 0) + 1;
    const id = newId("pv_");
    await tx.run(`INSERT INTO policy_versions (id, version, use_start, use_end, grace_minutes, timezone, created_by, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, version, input.useStart, input.useEnd, input.graceMinutes, input.timezone, admin.id, nowIso()]);
    await audit(tx, { actorId: admin.id, action: "policy.versioned", entityType: "policy", entityId: id, detail: { version, ...input } });
    return version;
  });
  resetCycleCache();
  return ok({ version: v, note: "Applies to cycles created from now on. Cycles already started keep their snapshot." });
});
