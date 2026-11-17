/**
 * Local-server scheduler: while this Node server runs (not on Vercel), call the idempotent
 * overdue evaluation every 60 s. On Vercel, Vercel Cron calls /api/cron/evaluate instead.
 * Staff dashboard refresh also reconciles overdue status as a recovery path.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.VERCEL || !process.env.CRON_SECRET) return;
  const g = globalThis as unknown as { __hpTimer?: ReturnType<typeof setInterval> };
  if (g.__hpTimer) return;
  const port = process.env.PORT || "3333";
  const tick = async () => {
    try {
      await fetch(`http://localhost:${port}/api/cron/evaluate`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` }, cache: "no-store" });
    } catch { /* server not ready yet */ }
  };
  g.__hpTimer = setInterval(tick, 60_000);
  setTimeout(tick, 15_000);
}
