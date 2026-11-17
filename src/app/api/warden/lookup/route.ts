import { handle, ok, pageParams } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

/** Physical ID / roll-number lookup — collection works without the student's deposited phone. */
export const GET = handle(async (req: Request) => {
  const u = await requireUser("warden", "admin");
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim().toLowerCase().slice(0, 60);
  const { limit } = pageParams(url);
  const scope = u.role === "admin" ? "" : "AND u.hostel_id IN (SELECT hostel_id FROM warden_hostels WHERE warden_id = $2)";
  const rows = await getDb().all(
    `SELECT u.id, u.name, u.roll_no, u.room, p.description AS phone, p.storage_slot, r.id AS active_receipt_id, r.deposited_at
       FROM users u LEFT JOIN phones p ON p.student_id = u.id AND p.active = 1
       LEFT JOIN custody_receipts r ON r.phone_id = p.id AND r.returned_at IS NULL
      WHERE u.role = 'student' AND u.active = 1 AND (LOWER(u.roll_no) = $1 OR LOWER(u.name) LIKE '%' || $1 || '%' OR LOWER(u.room) = $1) ${scope}
      ORDER BY u.roll_no LIMIT ${limit}`, u.role === "admin" ? [q] : [q, u.id]);
  return ok({ results: rows });
});
