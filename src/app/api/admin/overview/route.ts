import { handle, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { currentCycle, pushConfigured } from "@/lib/services";
import { cyclePublic } from "@/lib/custody";

export const GET = handle(async () => {
  await requireUser("admin");
  const db = getDb();
  const [policies, hostels, classes, teachers, wardens, cycle, lastEval] = await Promise.all([
    db.all(`SELECT p.id, p.version, p.use_start, p.use_end, p.grace_minutes, p.timezone, p.created_at, u.name AS created_by_name FROM policy_versions p LEFT JOIN users u ON u.id = p.created_by ORDER BY p.version DESC LIMIT 10`),
    db.all(`SELECT id, name, code FROM hostels ORDER BY name LIMIT 25`),
    db.all(`SELECT c.id, c.name, c.subject_code, c.enroll_code, c.teacher_id, t.name AS teacher_name FROM classes c JOIN users t ON t.id = c.teacher_id ORDER BY c.name LIMIT 100`),
    db.all(`SELECT id, name, email FROM users WHERE role = 'teacher' AND active = 1 ORDER BY name LIMIT 100`),
    db.all(`SELECT u.id, u.name, u.email, wh.hostel_id FROM users u LEFT JOIN warden_hostels wh ON wh.warden_id = u.id WHERE u.role = 'warden' ORDER BY u.name LIMIT 100`),
    currentCycle(),
    db.get<{ evaluated_at: string }>(`SELECT MAX(evaluated_at) AS evaluated_at FROM deposit_cycles`),
  ]);
  return ok({
    policies, hostels, classes, teachers, wardens, cycle: cyclePublic(cycle),
    system: {
      storage: db.driver,
      push: pushConfigured() ? "configured" : "not_configured",
      scheduler: process.env.CRON_SECRET ? (process.env.VERCEL ? "Vercel Cron → /api/cron/evaluate (daily on Hobby plans) + staff-refresh reconciliation" : "Local server interval (60 s) + staff-refresh reconciliation") : "Staff-refresh reconciliation only (no scheduler configured)",
      lastEvaluation: lastEval?.evaluated_at ?? null,
    },
  });
});
