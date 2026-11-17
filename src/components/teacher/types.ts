export type Classes = {
  classes: { id: string; name: string; subject_code: string; enroll_code: string; teacher_name: string; enrolled: number; active_session_id: string | null }[];
  pending: { class_id: string; student_id: string; name: string; email: string; roll_no: string | null; requested_at: string }[];
  recent: { id: string; class_id: string; status: string; opened_at: string; present_count: number; total: number }[];
};
export type Row = { student_id: string; name: string; roll_no: string; room: string; record_id: string | null; status: string | null; method: string | null; face_check: string | null; face_image: string | null; manual_reason: string | null; requested_at: string | null; decided_at: string | null };
export type Session = {
  session: { id: string; class_id: string; status: "open" | "closed" | "finalized"; opened_at: string; closed_at: string | null; finalized_at: string | null; class_name: string; subject_code: string };
  counts: { total: number; pending: number; present: number; late: number; absent: number; excused: number; unmarked: number };
  roster: Row[];
  join: { code: string; expiresAt: string; qrPayload: string } | null;
};

export type Mark = (ids: string[], status: string, manualReason?: string) => Promise<boolean>;
export type Tab = "live" | "pending" | "roster";

export const METHOD: Record<string, string> = { qr: "QR", code: "Code", manual: "Manual", finalize_default: "Auto-absent" };
