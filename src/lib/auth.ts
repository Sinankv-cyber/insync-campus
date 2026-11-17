import "server-only";
import { cookies } from "next/headers";
import { getIronSession, type SessionOptions } from "iron-session";
import { getDb } from "./db";
import { ensureMigrated } from "./migrations";
import { fail } from "./api";

export type Role = "student" | "teacher" | "warden" | "admin";
export type SessionData = { userId?: string; issuedAt?: number };
export type CurrentUser = {
  id: string; email: string; name: string; role: Role; roll_no: string | null;
  hostel_id: string | null; room: string | null; hostel_name: string | null;
};

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET must be set (32+ chars)");
  return s;
}

export function sessionOptions(): SessionOptions {
  return {
    password: secret(),
    cookieName: "insync_session",
    ttl: 60 * 60 * 24 * 7,
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production" || (process.env.APP_URL || "").startsWith("https://"),
      path: "/",
    },
  };
}

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions());
}

export async function currentUser(): Promise<CurrentUser | null> {
  await ensureMigrated();
  const s = await getSession();
  if (!s.userId) return null;
  const u = await getDb().get<CurrentUser>(
    `SELECT u.id, u.email, u.name, u.role, u.roll_no, u.hostel_id, u.room, h.name AS hostel_name
       FROM users u LEFT JOIN hostels h ON h.id = u.hostel_id
      WHERE u.id = $1 AND u.active = 1`,
    [s.userId],
  );
  return u ?? null;
}

/** Server-side authorization gate: identity always comes from the session, never the request body. */
export async function requireUser(...roles: Role[]): Promise<CurrentUser> {
  const u = await currentUser();
  if (!u) throw fail("UNAUTHENTICATED", "Please sign in again.", 401);
  if (roles.length && !roles.includes(u.role)) throw fail("FORBIDDEN", "Your role cannot perform this action.", 403);
  return u;
}

/** Wardens may act only on students in their assigned hostels; admins on all. */
export async function assertWardenScope(user: CurrentUser, studentId: string) {
  if (user.role === "admin") return;
  const r = await getDb().get(
    `SELECT 1 AS ok FROM users s JOIN warden_hostels wh ON wh.hostel_id = s.hostel_id
      WHERE s.id = $1 AND wh.warden_id = $2 AND s.role = 'student'`,
    [studentId, user.id],
  );
  if (!r) throw fail("FORBIDDEN", "This student is not in a hostel assigned to you.", 403);
}

export async function assertTeacherOwnsClass(user: CurrentUser, classId: string) {
  if (user.role === "admin") return;
  const r = await getDb().get(`SELECT 1 AS ok FROM classes WHERE id = $1 AND teacher_id = $2`, [classId, user.id]);
  if (!r) throw fail("FORBIDDEN", "This class is not assigned to you.", 403);
}
