import { handle, ok } from "@/lib/api";
import { currentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { pushConfigured } from "@/lib/services";

export const GET = handle(async () => {
  const u = await currentUser();
  const db = getDb();
  const env = {
    storage: db.driver,
    push: pushConfigured(),
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY || null,
    google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    scheduler: process.env.CRON_SECRET ? "server" : "refresh_only",
  };
  if (!u) return ok({ user: null, env });
  let enrollments: unknown[] = [];
  if (u.role === "student") {
    enrollments = await db.all(
      `SELECT c.id, c.name, c.subject_code, e.status FROM class_enrollments e JOIN classes c ON c.id = e.class_id WHERE e.student_id = $1 ORDER BY c.name LIMIT 25`, [u.id]);
  }
  return ok({ user: u, enrollments, env });
});
