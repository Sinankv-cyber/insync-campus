import "server-only";
import { getDb } from "./db";
import { fail } from "./api";
import type { CurrentUser } from "./auth";

export type StudentCard = { id: string; name: string; roll_no: string; room: string; hostel_name: string; phone_id: string | null; phone: string | null; storage_slot: string | null; active_receipt_id: string | null; deposited_at: string | null; receipt_slot: string | null };

export async function studentCard(user: CurrentUser, studentId: string): Promise<StudentCard> {
  // Scope check folded into the same query (one round trip): wardens see only their hostels.
  const scoped = user.role !== "admin";
  const s = await getDb().get<StudentCard>(
    `SELECT u.id, u.name, u.roll_no, u.room, h.name AS hostel_name, p.id AS phone_id, p.description AS phone, p.storage_slot,
            r.id AS active_receipt_id, r.deposited_at, r.storage_slot AS receipt_slot
       FROM users u LEFT JOIN hostels h ON h.id = u.hostel_id
       LEFT JOIN phones p ON p.student_id = u.id AND p.active = 1
       LEFT JOIN custody_receipts r ON r.phone_id = p.id AND r.returned_at IS NULL
      WHERE u.id = $1 AND u.role = 'student'${scoped ? " AND u.hostel_id IN (SELECT hostel_id FROM warden_hostels WHERE warden_id = $2)" : ""}`, scoped ? [studentId, user.id] : [studentId]);
  if (!s) throw scoped ? fail("FORBIDDEN", "This student is not in a hostel assigned to you.", 403) : fail("NOT_FOUND", "Student not found.", 404);
  return s;
}
