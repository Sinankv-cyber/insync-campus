import bcrypt from "bcryptjs";
import { z } from "zod";
import { body, fail, handle, ok } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ensureMigrated } from "@/lib/migrations";
import { audit, checkRateLimit, clearFailures, recordFailure } from "@/lib/services";

const Schema = z.object({ email: z.string().trim().toLowerCase().email().max(200), password: z.string().min(1).max(200) });

export const POST = handle(async (req: Request) => {
  await ensureMigrated();
  const { email, password } = await body(req, Schema);
  const key = `login:${email}`;
  await checkRateLimit(key, 8, 900);
  const db = getDb();
  const u = await db.get<{ id: string; password_hash: string | null; role: string; active: number }>(`SELECT id, password_hash, role, active FROM users WHERE email = $1`, [email]);
  const okPw = u?.password_hash ? await bcrypt.compare(password, u.password_hash) : false;
  if (!u || !okPw || !Number(u.active)) {
    await recordFailure(key, 900);
    throw fail("UNAUTHENTICATED", u && !u.password_hash ? "This account signs in with Google." : "Email or password is incorrect.", 401);
  }
  await clearFailures(key);
  const s = await getSession();
  s.userId = u.id;
  s.issuedAt = Date.now();
  await s.save();
  await db.tx((tx) => audit(tx, { actorId: u.id, action: "auth.login", entityType: "user", entityId: u.id, subjectUserId: u.id, detail: { method: "password" } }));
  return ok({ role: u.role });
});
