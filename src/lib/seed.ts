import "server-only";
import bcrypt from "bcryptjs";
import { getDb, type Tx } from "./db";
import { runMigrations } from "./migrations";
import { addDays, cycleBounds, localDate } from "./schedule";

/** Explicit synthetic development data. Idempotent: fixed ids + ON CONFLICT DO NOTHING. */
export const DEMO_PASSWORD = "InSync@2026";

const STUDENTS: [string, string, string, string, string][] = [
  // name, roll, room, phone description, slot
  ["Ameen Rasheed", "H024", "12", "Redmi Note 13, black, cracked corner", "B-12"],
  ["Fathima Nazrin", "H025", "14", "Samsung Galaxy M34, blue case", "B-13"],
  ["Arjun Nair", "H026", "12", "iPhone 13, white", "B-14"],
  ["Nandana Suresh", "H027", "15", "Vivo T3, green", "B-15"],
  ["Rahul Krishnan", "H028", "16", "OnePlus Nord CE4, grey", "B-16"],
  ["Anjali Menon", "H029", "15", "Samsung Galaxy A15, purple case", "B-17"],
  ["Sreehari P", "H030", "17", "Realme 12, gold", "B-18"],
  ["Aysha Beevi", "H031", "14", "iPhone 11, red", "B-19"],
  ["Vishnu Prasad", "H032", "18", "Poco X6, black", "B-20"],
  ["Meera Thomas", "H033", "19", "Moto G85, blue", "B-21"],
  ["Adil Muhammed", "H034", "16", "Redmi 13C, green case", "C-01"],
  ["Gopika Raj", "H035", "19", "Samsung Galaxy S23 FE, mint", "C-02"],
  ["Nikhil Joseph", "H036", "17", "iQOO Z9, black", "C-03"],
  ["Sana Fathima", "H037", "20", "Oppo A79, silver", "C-04"],
  ["Akhil Babu", "H038", "18", "Nothing Phone 2a, white", "C-05"],
  ["Devika Anil", "H039", "20", "iPhone 12, blue", "C-06"],
  ["Hrithik Mohan", "H040", "21", "Realme Narzo 70, blue", "C-07"],
  ["Lakshmi Priya", "H041", "21", "Samsung Galaxy M15, dark blue", "C-08"],
  ["Jithin George", "H042", "22", "Infinix Note 40, black", "C-09"],
  ["Riya Varghese", "H043", "22", "Pixel 7a, sea blue", "C-10"],
];

const sid = (i: number) => `u_stu_${String(i + 1).padStart(2, "0")}`;
const email = (name: string) => `${name.split(" ")[0].toLowerCase()}@insync.test`;

export async function seed(): Promise<{ applied: string[]; seeded: boolean }> {
  const applied = await runMigrations();
  const db = getDb();
  const already = await db.get(`SELECT 1 AS x FROM users WHERE id = 'u_admin'`);
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const now = new Date();
  const T = (d: Date) => d.toISOString();
  const created = T(new Date(now.getTime() - 30 * 86400_000));

  await db.tx(async (tx) => {
    const ins = (sql: string, p: unknown[]) => tx.run(sql + " ON CONFLICT DO NOTHING", p);
    await ins(`INSERT INTO hostels (id, name, code) VALUES ($1,$2,$3)`, ["h_periyar", "Periyar Hostel", "PRY"]);
    const staff: [string, string, string, string][] = [
      ["u_admin", "admin@insync.test", "College Office (Admin)", "admin"],
      ["u_t_priya", "priya@insync.test", "Dr. Priya Menon", "teacher"],
      ["u_t_joseph", "joseph@insync.test", "Joseph Varghese", "teacher"],
      ["u_warden", "warden@insync.test", "Suresh Kumar (Warden)", "warden"],
    ];
    for (const [id, em, name, role] of staff)
      await ins(`INSERT INTO users (id, email, name, role, password_hash, is_demo, created_at) VALUES ($1,$2,$3,$4,$5,1,$6)`, [id, em, name, role, hash, created]);
    await ins(`INSERT INTO warden_hostels (warden_id, hostel_id) VALUES ($1,$2)`, ["u_warden", "h_periyar"]);
    for (let i = 0; i < STUDENTS.length; i++) {
      const [name, roll, room, phone, slot] = STUDENTS[i];
      await ins(`INSERT INTO users (id, email, name, role, password_hash, roll_no, hostel_id, room, is_demo, created_at) VALUES ($1,$2,$3,'student',$4,$5,'h_periyar',$6,1,$7)`, [sid(i), email(name), name, hash, roll, room, created]);
      await ins(`INSERT INTO phones (id, student_id, description, storage_slot, active, created_at) VALUES ($1,$2,$3,$4,1,$5)`, [`ph_${i + 1}`, sid(i), phone, slot, created]);
    }
    await ins(`INSERT INTO classes (id, name, subject_code, enroll_code, teacher_id, created_at) VALUES ($1,$2,$3,$4,$5,$6)`, ["c_ds", "Data Structures — S3 CSE", "CS201", "CS2KRM7P", "u_t_priya", created]);
    await ins(`INSERT INTO classes (id, name, subject_code, enroll_code, teacher_id, created_at) VALUES ($1,$2,$3,$4,$5,$6)`, ["c_math", "Engineering Mathematics III", "MA202", "MA2QHT9W", "u_t_joseph", created]);
    for (let i = 0; i < 20; i++) {
      if (i < 12) await ins(`INSERT INTO class_enrollments (class_id, student_id, status, requested_at, decided_at, decided_by) VALUES ('c_ds',$1,'approved',$2,$2,'u_t_priya')`, [sid(i), created]);
      if (i >= 8) await ins(`INSERT INTO class_enrollments (class_id, student_id, status, requested_at, decided_at, decided_by) VALUES ('c_math',$1,'approved',$2,$2,'u_t_joseph')`, [sid(i), created]);
    }
    // Policy v1: 18:00–21:00 Asia/Kolkata, 5 min grace
    await ins(`INSERT INTO policy_versions (id, version, use_start, use_end, grace_minutes, timezone, created_by, created_at) VALUES ('pv_1',1,'18:00','21:00',5,'Asia/Kolkata','u_admin',$1)`, [created]);

    if (!already) await seedHistory(tx, now);
  });
  return { applied, seeded: !already };
}

async function seedHistory(tx: Tx, now: Date) {
  const policy = { use_start: "18:00", use_end: "21:00", grace_minutes: 5, timezone: "Asia/Kolkata" };
  const today = localDate(now, policy.timezone);
  const statuses = ["present", "present", "present", "present", "late", "present", "absent", "present", "excused", "present"];
  // Attendance: 4 finalized sessions per class on previous days
  for (let d = 4; d >= 1; d--) {
    const day = addDays(today, -d);
    for (const [cls, teacher, from, to, hour] of [["c_ds", "u_t_priya", 0, 12, "09:30"], ["c_math", "u_t_joseph", 8, 20, "11:00"]] as const) {
      const opened = cycleBounds(day, { ...policy, use_start: hour, use_end: "23:00" }).windowStart;
      const sessId = `s_${cls}_${d}`;
      await tx.run(`INSERT INTO attendance_sessions (id, class_id, teacher_id, status, opened_at, closed_at, finalized_at) VALUES ($1,$2,$3,'finalized',$4,$5,$5) ON CONFLICT DO NOTHING`,
        [sessId, cls, teacher, opened.toISOString(), new Date(opened.getTime() + 20 * 60000).toISOString()]);
      for (let i = from; i < to; i++) {
        const st = statuses[(i + d) % statuses.length];
        const method = st === "absent" ? "finalize_default" : i % 5 === 0 ? "code" : "qr";
        await tx.run(`INSERT INTO attendance_records (id, session_id, student_id, status, method, face_check, requested_at, decided_by, decided_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING`,
          [`r_${sessId}_${i}`, sessId, sid(i), st, method, method === "finalize_default" ? "not_checked" : "face_detected",
           new Date(opened.getTime() + (2 + i) * 60000).toISOString(), teacher, new Date(opened.getTime() + 15 * 60000).toISOString()]);
      }
    }
  }
  // Custody: previous 3 cycles. Deposited before deadline, returned at next window start (if that is in the past).
  for (let d = 3; d >= 1; d--) {
    const day = addDays(today, -d);
    const b = cycleBounds(day, policy);
    const cyId = `cy_seed_${d}`;
    await tx.run(`INSERT INTO deposit_cycles (id, cycle_key, is_demo, policy_version_id, use_start, use_end, grace_minutes, timezone, window_start, window_end, deadline, evaluated_at, created_at)
      VALUES ($1,$2,0,'pv_1','18:00','21:00',5,'Asia/Kolkata',$3,$4,$5,$5,$3) ON CONFLICT DO NOTHING`, [cyId, day, b.windowStart.toISOString(), b.windowEnd.toISOString(), b.deadline.toISOString()]);
    const nextStart = cycleBounds(addDays(day, 1), policy).windowStart;
    for (let i = 0; i < 20; i++) {
      const late = d === 2 && i === 16; // Hrithik was late two days ago -> resolved alert
      const dep = new Date(b.windowEnd.getTime() + (late ? 25 : -(i % 9)) * 60000);
      const ret = new Date(nextStart.getTime() + (3 + (i % 7)) * 60000);
      const returned = ret < now;
      const rid = `rc_${d}_${i}`;
      await tx.run(`INSERT INTO custody_receipts (id, phone_id, student_id, cycle_id, storage_slot, deposited_at, received_by, deposit_method, returned_at, returned_by, return_method)
        VALUES ($1,$2,$3,$4,$5,$6,'u_warden',$7,$8,$9,$10) ON CONFLICT DO NOTHING`,
        [rid, `ph_${i + 1}`, sid(i), cyId, STUDENTS[i][4], dep.toISOString(), i % 4 === 0 ? "code" : "qr",
         returned ? ret.toISOString() : null, returned ? "u_warden" : null, returned ? (i % 6 === 0 ? "id_lookup" : "qr") : null]);
      if (late) {
        await tx.run(`INSERT INTO alerts (id, kind, student_id, cycle_id, status, created_at, resolved_at, resolved_receipt_id) VALUES ('al_seed_1','phone_not_deposited',$1,$2,'resolved',$3,$4,$5) ON CONFLICT DO NOTHING`,
          [sid(i), cyId, b.deadline.toISOString(), dep.toISOString(), rid]);
      }
    }
  }
  // Exceptions: one approved (medical), one pending request
  await tx.run(`INSERT INTO exceptions (id, student_id, reason, starts_at, expires_at, status, requested_by, decided_by, decided_at, decision_note, created_at) VALUES ('ex_seed_1',$1,$2,$3,$4,'approved',$1,'u_warden',$3,$5,$3) ON CONFLICT DO NOTHING`,
    [sid(19), "Family medical emergency — needs phone to coordinate hospital visit", new Date(now.getTime() - 3600_000).toISOString(), new Date(now.getTime() + 2 * 86400_000).toISOString(), "Approved after call with parent"]);
  await tx.run(`INSERT INTO exceptions (id, student_id, reason, starts_at, expires_at, status, requested_by, created_at) VALUES ('ex_seed_2',$1,$2,$3,$4,'pending',$1,$3) ON CONFLICT DO NOTHING`,
    [sid(9), "Inter-college hackathon tonight; team coordination until 11 PM", now.toISOString(), new Date(now.getTime() + 8 * 3600_000).toISOString()]);
  // Pending class enrollment request from a Google-style new student
  await tx.run(`INSERT INTO class_enrollments (class_id, student_id, status, requested_at) VALUES ('c_ds',$1,'pending',$2) ON CONFLICT DO NOTHING`, [sid(14), now.toISOString()]);
  await tx.run(`INSERT INTO notifications (id, user_id, kind, title, body, created_at, push_status) VALUES ('nt_seed_1',$1,'receipt','Phone received, Slot B-12','Received by Suresh Kumar (Warden). Keep this receipt.',$2,'not_configured') ON CONFLICT DO NOTHING`,
    [sid(0), new Date(now.getTime() - 20 * 3600_000).toISOString()]);
  await tx.run(`INSERT INTO audit_events (id, actor_id, action, entity_type, entity_id, detail, created_at) VALUES ('ae_seed','u_admin','seed.loaded','system',NULL,$1,$2) ON CONFLICT DO NOTHING`,
    [JSON.stringify({ note: "Synthetic development data" }), now.toISOString()]);
}
