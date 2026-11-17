import bcrypt from "bcryptjs";
import { z } from "zod";
import { body, fail, handle, ok, pageParams } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getDb, isUniqueViolation } from "@/lib/db";
import { audit } from "@/lib/services";
import { newId, nowIso } from "@/lib/util";

export const GET = handle(async (req: Request) => {
  await requireUser("admin");
  const url = new URL(req.url);
  const { limit, offset } = pageParams(url);
  const q = (url.searchParams.get("q") || "").trim().toLowerCase().slice(0, 60);
  const role = url.searchParams.get("role") || "";
  const params: unknown[] = [`%${q}%`];
  let where = `(LOWER(u.name) LIKE $1 OR LOWER(u.email) LIKE $1 OR LOWER(COALESCE(u.roll_no,'')) LIKE $1)`;
  if (["student", "teacher", "warden", "admin"].includes(role)) { params.push(role); where += ` AND u.role = $${params.length}`; }
  const rows = await getDb().all(
    `SELECT u.id, u.name, u.email, u.role, u.roll_no, u.room, u.hostel_id, u.active, u.google_sub IS NOT NULL AS google_linked, p.description AS phone, p.storage_slot
       FROM users u LEFT JOIN phones p ON p.student_id = u.id AND p.active = 1 WHERE ${where} ORDER BY u.role, u.name, u.id LIMIT ${limit} OFFSET ${offset}`, params);
  return ok({ users: rows, limit, offset });
});

const Create = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(200),
  role: z.enum(["student", "teacher", "warden", "admin"]),
  password: z.string().min(10).max(200).optional(),
  rollNo: z.string().trim().max(20).optional(),
  hostelId: z.string().max(60).optional(),
  room: z.string().trim().max(20).optional(),
});

/** Only administrators create accounts with staff roles. Staff can sign in with Google using this email. */
export const POST = handle(async (req: Request) => {
  const admin = await requireUser("admin");
  const input = await body(req, Create);
  const db = getDb();
  const id = newId("u_");
  try {
    await db.tx(async (tx) => {
      await tx.run(`INSERT INTO users (id, email, name, role, password_hash, roll_no, hostel_id, room, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [id, input.email, input.name, input.role, input.password ? await bcrypt.hash(input.password, 10) : null, input.rollNo || null, input.hostelId || null, input.room || null, nowIso()]);
      if (input.role === "warden" && input.hostelId) await tx.run(`INSERT INTO warden_hostels (warden_id, hostel_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [id, input.hostelId]);
      await audit(tx, { actorId: admin.id, action: "user.created", entityType: "user", entityId: id, subjectUserId: id, detail: { role: input.role } });
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw fail("CONFLICT", "Email or roll number already exists.", 409);
    throw e;
  }
  return ok({ id });
});
