import "server-only";
import { getDb } from "./db";
import { fail } from "./api";
import type { CurrentUser } from "./auth";
import { lookupCredential } from "./services";
import { isWellFormedCode, normalizeCode } from "./util";

export async function resolveJoin(user: CurrentUser, rawCode: string) {
  const code = normalizeCode(rawCode);
  if (!isWellFormedCode(code)) throw fail("INVALID_CODE", "Codes are 8 letters/numbers, like K7QM-4XPR.", 400);
  const cred = await lookupCredential(code, ["attendance_join"], `code:${user.id}`);
  const db = getDb();
  const s = await db.get<{ id: string; status: string; opened_at: string; class_id: string; class_name: string; subject_code: string; teacher_name: string }>(
    `SELECT s.id, s.status, s.opened_at, s.class_id, c.name AS class_name, c.subject_code, t.name AS teacher_name
       FROM attendance_sessions s JOIN classes c ON c.id = s.class_id JOIN users t ON t.id = s.teacher_id WHERE s.id = $1`, [cred.subject_id]);
  if (!s) throw fail("INVALID_CODE", "Session not found.", 404);
  if (s.status !== "open") throw fail("SESSION_CLOSED", "This attendance session is closed.", 410);
  const en = await db.get<{ status: string }>(`SELECT status FROM class_enrollments WHERE class_id = $1 AND student_id = $2`, [s.class_id, user.id]);
  if (!en || en.status !== "approved") throw fail("NOT_ENROLLED", en?.status === "pending" ? "Your request to join this class is still waiting for teacher approval." : "You are not enrolled in this class. Ask your teacher for the class code.", 403);
  const existing = await db.get<{ status: string; requested_at: string }>(`SELECT status, requested_at FROM attendance_records WHERE session_id = $1 AND student_id = $2`, [s.id, user.id]);
  return { session: s, credentialId: cred.id, expiresAt: cred.expires_at, existing: existing ?? null };
}
