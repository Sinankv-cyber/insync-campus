// End-to-end acceptance checks against a running server (default http://localhost:3333).
// Usage: node scripts/acceptance.mjs [baseUrl]
// Uses the seeded synthetic demo accounts only. Mutates demo data (creates sessions/receipts/alerts).
const BASE = process.argv[2] || "http://localhost:3333";
const PW = "InSync@2026";
let pass = 0, failN = 0;
const results = [];
function check(name, cond, extra = "") {
  (cond ? pass++ : failN++);
  results.push(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
}

class Client {
  constructor() { this.cookie = ""; }
  async req(path, method = "GET", body) {
    const res = await fetch(BASE + path, { method, headers: { ...(body ? { "content-type": "application/json" } : {}), ...(this.cookie ? { cookie: this.cookie } : {}) }, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
    const sc = res.headers.getSetCookie?.() ?? [];
    for (const c of sc) if (c.startsWith("insync_session=")) this.cookie = c.split(";")[0];
    let json = null; try { json = await res.json(); } catch {}
    return { status: res.status, ...(json || {}) };
  }
  login(email) { return this.req("/api/auth/login", "POST", { email, password: PW }); }
}

const anon = new Client(), stu = new Client(), stu2 = new Client(), outsider = new Client(), teacher = new Client(), teacher2 = new Client(), warden = new Client(), admin = new Client();
await stu.login("ameen@insync.test");
await stu2.login("fathima@insync.test");
await outsider.login("riya@insync.test"); // enrolled in Maths only, not Data Structures
await teacher.login("priya@insync.test");
await teacher2.login("joseph@insync.test");
await warden.login("warden@insync.test");
await admin.login("admin@insync.test");

// ---- Authorization boundaries ----
check("anonymous denied student data", (await anon.req("/api/student/today")).status === 401);
check("student denied warden deposit", (await stu.req("/api/warden/deposit", "POST", { studentId: "u_stu_01", method: "id_lookup", note: "x", physicallyChecked: true })).error?.code === "FORBIDDEN");
check("student denied admin policy", (await stu.req("/api/admin/policy", "POST", { useStart: "18:00", useEnd: "21:00", graceMinutes: 5 })).status === 403);
check("teacher denied other teacher's class", (await teacher2.req("/api/teacher/sessions", "POST", { classId: "c_ds" })).error?.code === "FORBIDDEN");
check("warden denied attendance confirm", (await warden.req("/api/teacher/records", "POST", { sessionId: "x", studentIds: ["u_stu_01"], status: "present" })).status === 403);
check("wrong password rejected", (await new Client().req("/api/auth/login", "POST", { email: "ameen@insync.test", password: "nope" })).status === 401);

// ---- Journey 1: QR attendance -> teacher confirmation -> persistent result ----
// Clean up any open session left by an earlier run
const classes = await teacher.req("/api/teacher/classes");
const ds = classes.data.classes.find((c) => c.id === "c_ds");
if (ds.active_session_id) {
  await teacher.req(`/api/teacher/sessions/${ds.active_session_id}`, "POST", { action: "close" });
  const s0 = await teacher.req(`/api/teacher/sessions/${ds.active_session_id}`);
  for (const r of s0.data.roster.filter((x) => x.status === "pending")) await teacher.req("/api/teacher/records", "POST", { sessionId: ds.active_session_id, studentIds: [r.student_id], status: "absent" });
  await teacher.req(`/api/teacher/sessions/${ds.active_session_id}`, "POST", { action: "finalize" });
}
const open = await teacher.req("/api/teacher/sessions", "POST", { classId: "c_ds" });
check("teacher opens session", open.ok, open.error?.message);
const sid = open.data?.sessionId;
check("second open session rejected", (await teacher.req("/api/teacher/sessions", "POST", { classId: "c_ds" })).error?.code === "CONFLICT");
const sess = await teacher.req(`/api/teacher/sessions/${sid}`);
const joinCode = sess.data.join.code, qrPayload = sess.data.join.qrPayload;
check("join code is 8 chars w/o confusing chars", /^[A-HJKMNP-Z2-9]{8}$/.test(joinCode), joinCode);
check("QR payload carries no personal info", !/ameen|H0\d\d|@/i.test(qrPayload), qrPayload);
const pv1 = await stu.req(`/api/attendance/preview?code=${encodeURIComponent(qrPayload)}`);
const pv2 = await stu.req(`/api/attendance/preview?code=${joinCode.slice(0, 4)}-${joinCode.slice(4).toLowerCase()}`);
check("QR and typed code resolve to same session", pv1.ok && pv2.ok && pv1.data.className === pv2.data.className && pv1.data.openedAt === pv2.data.openedAt);
const j1 = await stu.req("/api/attendance/join", "POST", { code: qrPayload, method: "qr", faceCheck: "face_detected" });
check("student join creates Pending verification", j1.ok && j1.data.status === "pending", j1.error?.message);
const [d1, d2] = await Promise.all([stu.req("/api/attendance/join", "POST", { code: joinCode, method: "code" }), stu.req("/api/attendance/join", "POST", { code: joinCode, method: "code" })]);
check("duplicate join rejected (concurrent)", d1.error?.code === "ALREADY_JOINED" && d2.error?.code === "ALREADY_JOINED");
check("second student joins via typed code", (await stu2.req("/api/attendance/join", "POST", { code: joinCode, method: "code", faceCheck: "not_checked" })).ok);
check("non-enrolled student rejected", (await outsider.req("/api/attendance/join", "POST", { code: joinCode, method: "code" })).error?.code === "NOT_ENROLLED");
const hist0 = await stu.req("/api/student/history?limit=1");
check("student sees pending (not present) before teacher", hist0.data.attendance[0].status === "pending");
check("finalize blocked while pending", (await teacher.req(`/api/teacher/sessions/${sid}`, "POST", { action: "finalize" })).error?.code === "PENDING_REMAIN");
check("teacher confirms Present", (await teacher.req("/api/teacher/records", "POST", { sessionId: sid, studentIds: ["u_stu_01"], status: "present" })).ok);
check("teacher marks Late", (await teacher.req("/api/teacher/records", "POST", { sessionId: sid, studentIds: ["u_stu_02"], status: "late" })).ok);
check("manual entry needs reason", (await teacher.req("/api/teacher/records", "POST", { sessionId: sid, studentIds: ["u_stu_03"], status: "present" })).error?.code === "VALIDATION");
check("manual entry with reason", (await teacher.req("/api/teacher/records", "POST", { sessionId: sid, studentIds: ["u_stu_03"], status: "present", manualReason: "No working device" })).ok);
check("close session", (await teacher.req(`/api/teacher/sessions/${sid}`, "POST", { action: "close" })).ok);
check("closed session code rejected", ["EXPIRED_CODE", "SESSION_CLOSED"].includes((await stu2.req(`/api/attendance/preview?code=${joinCode}`)).error?.code));
const fin = await teacher.req(`/api/teacher/sessions/${sid}`, "POST", { action: "finalize" });
check("finalize marks non-joiners absent", fin.ok && fin.data.markedAbsent >= 1, JSON.stringify(fin.data || fin.error));
const hist1 = await stu.req("/api/student/history?limit=1");
check("student sees persisted Present", hist1.data.attendance[0].status === "present");

// ---- Journey 4 first: collection without the deposited phone (ID lookup) ----
async function custody(c) { return (await c.req("/api/student/today")).data.custody; }
let c1 = await custody(stu);
if (c1.status !== "in_custody") {
  await warden.req("/api/warden/deposit", "POST", { studentId: "u_stu_01", method: "id_lookup", note: "acceptance setup", physicallyChecked: true });
}
const ret = await warden.req("/api/warden/return", "POST", { studentId: "u_stu_01", method: "id_lookup", identityVerified: true, note: "Verified physical ID card" });
check("collection by roll-number lookup (no phone needed)", ret.ok, ret.error?.message);
check("double return rejected", (await warden.req("/api/warden/return", "POST", { studentId: "u_stu_01", method: "id_lookup", identityVerified: true, note: "retry" })).error?.code === "ALREADY_RETURNED");

// ---- Journey 3: short demo deadline -> genuine overdue alert -> handover resolves ----
const demo = await admin.req("/api/admin/demo-cycle", "POST", { minutes: 1, graceMinutes: 0 });
check("admin starts demo cycle", demo.ok);
const waitMs = new Date(demo.data.deadline).getTime() - Date.now() + 2500;
results.push(`....  waiting ${Math.round(waitMs / 1000)}s for demo deadline`);
await new Promise((r) => setTimeout(r, Math.max(0, waitMs)));
const wt = await warden.req("/api/warden/today?limit=100");
if (!wt.ok) results.push("....  warden/today error: " + JSON.stringify(wt.error ?? wt.status));
const alert = wt.data.alerts.find((a) => a.student_id === "u_stu_01" && a.status === "open");
check("overdue alert created after deadline", Boolean(alert));
const wt2 = await warden.req("/api/warden/today?limit=100");
check("alert evaluation idempotent", wt2.data.alerts.filter((a) => a.student_id === "u_stu_01" && a.status === "open").length === 1);
c1 = await custody(stu);
check("student sees overdue", c1.status === "overdue");

// ---- Journey 2: camera unavailable -> typed deposit code -> warden receives -> receipt ----
const p = await stu.req("/api/student/pass", "POST", { purpose: "deposit" });
check("deposit pass issued (~120s)", p.ok && p.data.ttlSec <= 180);
const resolveTyped = await warden.req("/api/warden/resolve", "POST", { code: `${p.data.code.slice(0, 4)}-${p.data.code.slice(4)}` });
check("typed code shows name/roll/room/phone/slot", resolveTyped.ok && resolveTyped.data.student.roll_no === "H024" && resolveTyped.data.student.storage_slot === "B-12");
const st0 = await stu.req(`/api/student/pass?id=${p.data.id}`);
check("scan/lookup alone does NOT mark deposited", st0.data.state === "waiting" && (await custody(stu)).status !== "in_custody");
check("wrong-purpose: deposit code to collect", (await warden.req("/api/warden/return", "POST", { credentialId: resolveTyped.data.credentialId, method: "code", identityVerified: true })).error?.code === "WRONG_PURPOSE");
const [r1, r2] = await Promise.all([
  warden.req("/api/warden/deposit", "POST", { credentialId: resolveTyped.data.credentialId, method: "code", physicallyChecked: true }),
  warden.req("/api/warden/deposit", "POST", { credentialId: resolveTyped.data.credentialId, method: "code", physicallyChecked: true }),
]);
check("concurrent confirms -> exactly one receipt", [r1, r2].filter((r) => r.ok).length === 1, JSON.stringify([r1.error?.code, r2.error?.code]));
const st1 = await stu.req(`/api/student/pass?id=${p.data.id}`);
check("student receipt after staff confirmation", st1.data.state === "confirmed" && st1.data.receipt.storage_slot === "B-12");
check("replayed pass rejected", (await warden.req("/api/warden/resolve", "POST", { code: p.data.code })).error?.code === "ALREADY_USED");
const wt3 = await warden.req("/api/warden/today?limit=100");
check("handover resolved the overdue alert", wt3.data.alerts.some((a) => a.student_id === "u_stu_01" && a.status === "resolved") && !wt3.data.alerts.some((a) => a.student_id === "u_stu_01" && a.status === "open"));
check("second deposit pass refused while in custody", (await stu.req("/api/student/pass", "POST", { purpose: "deposit" })).error?.code === "ALREADY_RECEIVED");

// ---- Credential abuse ----
check("invalid code rejected", (await warden.req("/api/warden/resolve", "POST", { code: "ZZZZ-ZZZZ" })).error?.code === "INVALID_CODE");
const p2 = await stu2.req("/api/student/pass", "POST", { purpose: "deposit" });
const p3 = await stu2.req("/api/student/pass", "POST", { purpose: "deposit" });
check("issuing a new pass revokes the previous one", (await warden.req("/api/warden/resolve", "POST", { code: p2.data.code })).error?.code === "EXPIRED_CODE" && (await warden.req("/api/warden/resolve", "POST", { code: p3.data.code })).ok);
let rl = null;
const rlClient = new Client(); await rlClient.login("vishnu@insync.test");
for (let i = 0; i < 12; i++) rl = await rlClient.req(`/api/attendance/preview?code=QQQQQQQ${"ABCDEFGHJKMN"[i]}`);
check("failed attempts are rate-limited", rl.error?.code === "RATE_LIMITED");
await admin.req("/api/admin/demo-cycle", "DELETE");

// ---- Audit ----
const au = await admin.req("/api/admin/audit?q=custody&limit=5");
check("audit history records custody events", au.ok && au.data.events.length > 0);
const big = await admin.req("/api/admin/users?limit=500");
check("list bounded to 100 max", big.ok && big.data.limit === 100);

console.log(results.join("\n"));
console.log(`\n${pass} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
