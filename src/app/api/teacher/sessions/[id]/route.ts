import { z } from "zod";
import { body, fail, handle, ok } from "@/lib/api";
import { assertTeacherOwnsClass, requireUser, type CurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { audit, issueCredential } from "@/lib/services";
import { newId, nowIso } from "@/lib/util";

type Ctx = { params: Promise<{ id: string }> };
const JOIN_TTL_SEC = 20 * 60;

async function loadSession(u: CurrentUser, id: string) {
  const s = await getDb().get<{ id: string; class_id: string; status: string; opened_at: string; closed_at: string | null; finalized_at: string | null; class_name: string; subject_code: string }>(
    `SELECT s.id, s.class_id, s.status, s.opened_at, s.closed_at, s.finalized_at, c.name AS class_name, c.subject_code FROM attendance_sessions s JOIN classes c ON c.id = s.class_id WHERE s.id = $1`, [id]);
  if (!s) throw fail("NOT_FOUND", "Session not found.", 404);
  await assertTeacherOwnsClass(u, s.class_id);
  return s;
}

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const u = await requireUser("teacher", "admin");
  const { id } = await ctx.params;
  const s = await loadSession(u, id);
  const db = getDb();
  const now = nowIso();
  const [cred, roster] = await Promise.all([
    db.get<{ code: string; expires_at: string }>(`SELECT code, expires_at FROM credentials WHERE subject_id = $1 AND purpose = 'attendance_join' AND revoked_at IS NULL AND expires_at > $2 ORDER BY created_at DESC LIMIT 1`, [id, now]),
    db.all<{ status: string | null }>(
      `SELECT u.id AS student_id, u.name, u.roll_no, u.room, r.id AS record_id, r.status, r.method, r.face_check, r.face_image, r.manual_reason, r.requested_at, r.decided_at
         FROM class_enrollments e JOIN users u ON u.id = e.student_id
         LEFT JOIN attendance_records r ON r.session_id = $1 AND r.student_id = u.id
        WHERE e.class_id = $2 AND e.status = 'approved'
        ORDER BY CASE WHEN r.status = 'pending' THEN 0 WHEN r.status IS NULL THEN 2 ELSE 1 END, r.requested_at, u.name LIMIT 100`, [id, s.class_id]),
  ]);
  const counts = { total: roster.length, pending: 0, present: 0, late: 0, absent: 0, excused: 0, unmarked: 0 };
  for (const r of roster) {
    const k = (r.status ?? "unmarked") as keyof typeof counts;
    counts[k]++;
  }
  const appUrl = process.env.APP_URL || "http://localhost:3333";
  return ok({
    session: s, counts, roster,
    join: cred && s.status === "open" ? { code: cred.code, expiresAt: cred.expires_at, qrPayload: `${appUrl}/attendance?c=${cred.code}` } : null,
  });
});

const Action = z.object({ action: z.enum(["close", "finalize", "refresh_code", "reopen"]) });

export const POST = handle(async (req: Request, ctx: Ctx) => {
  const u = await requireUser("teacher", "admin");
  const { id } = await ctx.params;
  const { action } = await body(req, Action);
  const s = await loadSession(u, id);
  const db = getDb();
  const now = nowIso();
  if (action === "close") {
    if (s.status !== "open") throw fail("SESSION_CLOSED", "Session is not open.", 409);
    await db.tx(async (tx) => {
      await tx.run(`UPDATE attendance_sessions SET status = 'closed', closed_at = $2 WHERE id = $1 AND status = 'open'`, [id, now]);
      await tx.run(`UPDATE credentials SET revoked_at = $2 WHERE subject_id = $1 AND purpose = 'attendance_join' AND revoked_at IS NULL`, [id, now]);
      await audit(tx, { actorId: u.id, action: "session.closed", entityType: "attendance_session", entityId: id });
    });
  } else if (action === "refresh_code") {
    if (s.status !== "open") throw fail("SESSION_CLOSED", "Session is not open.", 409);
    await db.tx(async (tx) => {
      await tx.run(`UPDATE credentials SET revoked_at = $2 WHERE subject_id = $1 AND purpose = 'attendance_join' AND revoked_at IS NULL`, [id, now]);
      await issueCredential(tx, "attendance_join", id, null, JOIN_TTL_SEC);
      await audit(tx, { actorId: u.id, action: "session.code_refreshed", entityType: "attendance_session", entityId: id });
    });
  } else if (action === "reopen") {
    if (s.status !== "closed") throw fail("CONFLICT", "Only a closed, unfinalized session can be reopened.", 409);
    const other = await db.get(`SELECT 1 AS x FROM attendance_sessions WHERE class_id = $1 AND status = 'open'`, [s.class_id]);
    if (other) throw fail("CONFLICT", "Another session is already open for this class.", 409);
    await db.tx(async (tx) => {
      await tx.run(`UPDATE attendance_sessions SET status = 'open', closed_at = NULL WHERE id = $1 AND status = 'closed'`, [id]);
      await issueCredential(tx, "attendance_join", id, null, JOIN_TTL_SEC);
      await audit(tx, { actorId: u.id, action: "session.reopened", entityType: "attendance_session", entityId: id });
    });
  } else {
    if (s.status === "finalized") throw fail("CONFLICT", "Already finalized.", 409);
    const result = await db.tx(async (tx) => {
      const pending = await tx.get<{ n: number }>(`SELECT COUNT(*) AS n FROM attendance_records WHERE session_id = $1 AND status = 'pending'`, [id]);
      if (Number(pending?.n) > 0) throw fail("PENDING_REMAIN", `Resolve ${pending!.n} pending request(s) before finalizing.`, 409, { pending: Number(pending!.n) });
      const unmarked = await tx.all<{ student_id: string }>(
        `SELECT e.student_id FROM class_enrollments e WHERE e.class_id = $1 AND e.status = 'approved'
            AND NOT EXISTS (SELECT 1 FROM attendance_records r WHERE r.session_id = $2 AND r.student_id = e.student_id)`, [s.class_id, id]);
      for (const m of unmarked)
        await tx.run(`INSERT INTO attendance_records (id, session_id, student_id, status, method, requested_at, decided_by, decided_at) VALUES ($1,$2,$3,'absent','finalize_default',$4,$5,$4) ON CONFLICT (session_id, student_id) DO NOTHING`,
          [newId("ar_"), id, m.student_id, now, u.id]);
      await tx.run(`UPDATE attendance_sessions SET status = 'finalized', finalized_at = $2, closed_at = COALESCE(closed_at, $2) WHERE id = $1`, [id, now]);
      await tx.run(`UPDATE credentials SET revoked_at = $2 WHERE subject_id = $1 AND purpose = 'attendance_join' AND revoked_at IS NULL`, [id, now]);
      await tx.run(`UPDATE attendance_records SET face_image = NULL WHERE session_id = $1`, [id]); // privacy: drop face snapshots once finalized
      await audit(tx, { actorId: u.id, action: "session.finalized", entityType: "attendance_session", entityId: id, detail: { markedAbsent: unmarked.length } });
      return { markedAbsent: unmarked.length };
    });
    return ok({ status: "finalized", ...result });
  }
  return ok({ status: action });
});
