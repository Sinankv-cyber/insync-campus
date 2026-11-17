import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { decodeIdToken } from "arctic";
import { googleClient } from "@/lib/google";
import { getDb } from "@/lib/db";
import { ensureMigrated } from "@/lib/migrations";
import { getSession } from "@/lib/auth";
import { audit } from "@/lib/services";
import { newId, nowIso } from "@/lib/util";

/**
 * Google sign-in. Existing accounts are matched by Google subject, then by verified email
 * (staff accounts are pre-created by an administrator). Unknown users become STUDENTS only —
 * public sign-up can never grant a staff role. New students then join a class with the
 * teacher's class code and wait for teacher approval.
 */
export async function GET(req: Request) {
  const base = process.env.APP_URL || "http://localhost:3333";
  const back = (q: string) => NextResponse.redirect(new URL(`/login?error=${q}`, base));
  const g = googleClient();
  if (!g) return back("google_not_configured");
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const jar = await cookies();
  const expected = jar.get("g_state")?.value;
  const verifier = jar.get("g_verifier")?.value;
  jar.delete("g_state");
  jar.delete("g_verifier");
  if (!code || !state || !expected || state !== expected || !verifier) return back("google_state");
  let claims: { sub: string; email?: string; email_verified?: boolean; name?: string };
  try {
    const tokens = await g.validateAuthorizationCode(code, verifier);
    claims = decodeIdToken(tokens.idToken()) as typeof claims;
  } catch {
    return back("google_exchange");
  }
  if (!claims.email || !claims.email_verified) return back("google_email");
  await ensureMigrated();
  const db = getDb();
  const email = claims.email.toLowerCase();
  const userId = await db.tx(async (tx) => {
    let u = await tx.get<{ id: string; active: number; google_sub: string | null }>(`SELECT id, active, google_sub FROM users WHERE google_sub = $1`, [claims.sub]);
    if (!u) {
      u = await tx.get(`SELECT id, active, google_sub FROM users WHERE email = $1`, [email]);
      if (u && !u.google_sub) await tx.run(`UPDATE users SET google_sub = $2 WHERE id = $1`, [u.id, claims.sub]);
      else if (u && u.google_sub && u.google_sub !== claims.sub) return null;
    }
    if (!u) {
      const id = newId("u_");
      await tx.run(`INSERT INTO users (id, email, name, role, google_sub, created_at) VALUES ($1,$2,$3,'student',$4,$5)`, [id, email, (claims.name || email).slice(0, 120), claims.sub, nowIso()]);
      await audit(tx, { actorId: id, action: "user.self_registered", entityType: "user", entityId: id, subjectUserId: id, detail: { via: "google", role: "student" } });
      return id;
    }
    if (!Number(u.active)) return null;
    await audit(tx, { actorId: u.id, action: "auth.login", entityType: "user", entityId: u.id, subjectUserId: u.id, detail: { method: "google" } });
    return u.id;
  });
  if (!userId) return back("account_disabled");
  const s = await getSession();
  s.userId = userId;
  s.issuedAt = Date.now();
  await s.save();
  return NextResponse.redirect(new URL("/", base));
}
