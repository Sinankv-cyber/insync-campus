import { fail, handle, ok } from "@/lib/api";
import { ensureMigrated } from "@/lib/migrations";
import { evaluateOverdue } from "@/lib/services";

/** Server-side deadline evaluation. Call from a host scheduler (e.g. Vercel Cron) with Authorization: Bearer CRON_SECRET. Idempotent. */
export const GET = handle(async (req: Request) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw fail("NOT_CONFIGURED", "CRON_SECRET is not configured.", 503);
  if (req.headers.get("authorization") !== `Bearer ${secret}`) throw fail("FORBIDDEN", "Invalid scheduler credential.", 403);
  await ensureMigrated();
  return ok(await evaluateOverdue());
});
