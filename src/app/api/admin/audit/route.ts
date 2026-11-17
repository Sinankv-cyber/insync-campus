import { handle, ok, pageParams } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const GET = handle(async (req: Request) => {
  await requireUser("admin");
  const url = new URL(req.url);
  const { limit, offset } = pageParams(url);
  const q = (url.searchParams.get("q") || "").trim().toLowerCase().slice(0, 60);
  const rows = await getDb().all(
    `SELECT a.id, a.action, a.entity_type, a.entity_id, a.detail, a.created_at, actor.name AS actor_name, subj.name AS subject_name, subj.roll_no AS subject_roll
       FROM audit_events a LEFT JOIN users actor ON actor.id = a.actor_id LEFT JOIN users subj ON subj.id = a.subject_user_id
      WHERE ($1 = '' OR LOWER(a.action) LIKE '%' || $1 || '%' OR LOWER(COALESCE(actor.name,'')) LIKE '%' || $1 || '%' OR LOWER(COALESCE(subj.name,'')) LIKE '%' || $1 || '%' OR LOWER(COALESCE(subj.roll_no,'')) = $1)
      ORDER BY a.created_at DESC, a.id LIMIT ${limit} OFFSET ${offset}`, [q]);
  return ok({ events: rows, limit, offset });
});
