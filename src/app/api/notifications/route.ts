import { handle, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { nowIso } from "@/lib/util";

export const GET = handle(async () => {
  const u = await requireUser();
  const rows = await getDb().all(`SELECT id, kind, title, body, created_at, read_at, push_status FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 25`, [u.id]);
  return ok({ notifications: rows });
});

export const POST = handle(async () => {
  const u = await requireUser();
  await getDb().run(`UPDATE notifications SET read_at = $2 WHERE user_id = $1 AND read_at IS NULL`, [u.id, nowIso()]);
  return ok({ read: true });
});
