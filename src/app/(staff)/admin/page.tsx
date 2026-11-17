"use client";
import { useRef, useState } from "react";
import { Activity, AlertTriangle, Ban, BookOpen, CalendarClock, CheckCircle2, Clock, Database, FileClock, GraduationCap, KeyRound, Moon, Plus, Search, Settings2, ShieldCheck, Timer, UserCog, Users } from "lucide-react";
import { api, fmtDateTime, fmtTime, hhmmLabel, type ApiErr } from "@/lib/client";
import { useLive } from "@/components/use-live";
import { Banner, Button, Card, CodeText, Empty, ErrorBanner, Field, LastUpdated, Pill, Skeleton, cx, inputCls } from "@/components/ui";

type Overview = {
  policies: { id: string; version: number; use_start: string; use_end: string; grace_minutes: number; timezone: string; created_at: string; created_by_name: string | null }[];
  hostels: { id: string; name: string; code: string }[];
  classes: { id: string; name: string; subject_code: string; enroll_code: string; teacher_id: string; teacher_name: string }[];
  teachers: { id: string; name: string; email: string }[];
  wardens: { id: string; name: string; email: string; hostel_id: string | null }[];
  cycle: { isDemo: boolean; deadline: string; windowStart: string; windowEnd: string; useStart: string; useEnd: string };
  system: { storage: string; push: string; scheduler: string; lastEvaluation: string | null };
};
type User = { id: string; name: string; email: string; role: string; roll_no: string | null; room: string | null; hostel_id: string | null; active: number; google_linked: boolean | number; phone: string | null; storage_slot: string | null };

const TABS = [["policy", Timer, "Phone-use policy", "Policy"], ["accounts", Users, "Accounts", "Accounts"], ["classes", BookOpen, "Classes", "Classes"], ["audit", FileClock, "Audit history", "Audit"]] as const;
type TabKey = (typeof TABS)[number][0];

const ROLE_ICON: Record<string, React.ReactNode> = {
  student: <GraduationCap className="size-3.5" aria-hidden />,
  teacher: <BookOpen className="size-3.5" aria-hidden />,
  warden: <ShieldCheck className="size-3.5" aria-hidden />,
  admin: <UserCog className="size-3.5" aria-hidden />,
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function AdminPage() {
  const [tab, setTab] = useState<TabKey>("policy");
  const o = useLive<Overview>("/api/admin/overview", 30000);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  function onTabKey(e: React.KeyboardEvent, i: number) {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const n = (i + d + TABS.length) % TABS.length;
    setTab(TABS[n][0]); tabRefs.current[n]?.focus();
  }
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0"><h1 className="text-2xl font-extrabold sm:text-3xl">Administration</h1><p className="text-navy-500">Policy, accounts, assignments and the audit trail.</p></div>
        <LastUpdated at={o.at} stale={o.stale} />
      </div>
      <ErrorBanner error={o.error ?? null} onRetry={o.reload} />
      {o.data && (
        <div className="grid gap-3 sm:grid-cols-3">
          <SysTile icon={<Database className="size-4" aria-hidden />} label="Data store" ok={o.data.system.storage === "neon"} value={o.data.system.storage === "neon" ? "Neon Postgres" : "Local SQLite demo (this server only)"} />
          <SysTile icon={<Activity className="size-4" aria-hidden />} label="Deadline scheduler" ok={Boolean(o.data.system.lastEvaluation)} value={o.data.system.scheduler} sub={o.data.system.lastEvaluation ? `Last evaluated ${fmtDateTime(o.data.system.lastEvaluation)}` : "Not evaluated yet"} />
          <SysTile icon={<Settings2 className="size-4" aria-hidden />} label="Web Push" ok={o.data.system.push === "configured"} value={o.data.system.push === "configured" ? "Configured (VAPID)" : "Not configured — in-app alerts only"} />
        </div>
      )}
      <div role="tablist" aria-label="Administration sections" className="grid grid-cols-2 gap-1 rounded-2xl bg-white p-1 shadow-card ring-1 ring-sand-200/70 sm:flex sm:w-fit">
        {TABS.map(([k, I, l, short], i) => (
          <button key={k} ref={(el) => { tabRefs.current[i] = el; }} id={`tab-${k}`} role="tab" aria-selected={tab === k} aria-controls={`panel-${k}`} tabIndex={tab === k ? 0 : -1}
            onClick={() => setTab(k)} onKeyDown={(e) => onTabKey(e, i)}
            className={cx("flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold transition-colors sm:justify-start sm:px-4", tab === k ? "bg-navy-900 text-white" : "text-navy-600 hover:bg-sand-100")}>
            <I className="size-4 shrink-0" aria-hidden /><span className="sm:hidden">{short}</span><span className="hidden sm:inline">{l}</span>
          </button>
        ))}
      </div>
      <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="min-w-0">
        {o.loading && !o.data && <Skeleton className="h-64" />}
        {o.data && tab === "policy" && <PolicyTab o={o.data} reload={o.reload} />}
        {o.data && tab === "accounts" && <AccountsTab o={o.data} />}
        {o.data && tab === "classes" && <ClassesTab o={o.data} reload={o.reload} />}
        {tab === "audit" && <AuditTab />}
      </div>
    </div>
  );
}

function SysTile({ icon, label, value, sub, ok }: { icon: React.ReactNode; label: string; value: string; sub?: string; ok: boolean }) {
  return (
    <Card className="flex min-w-0 flex-col gap-1 p-4">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-navy-500">{icon}{label}</p>
      <p className="flex items-start gap-1.5 font-semibold leading-snug">
        {ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-leaf-600" aria-hidden /> : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />}
        <span className="min-w-0">{value}</span>
      </p>
      {sub && <p className="pl-5.5 text-xs text-navy-500">{sub}</p>}
    </Card>
  );
}

function PolicyTab({ o, reload }: { o: Overview; reload: () => void }) {
  const cur = o.policies[0];
  const [start, setStart] = useState(cur?.use_start ?? "18:00");
  const [end, setEnd] = useState(cur?.use_end ?? "21:00");
  const [grace, setGrace] = useState(cur?.grace_minutes ?? 5);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<ApiErr | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [demoMin, setDemoMin] = useState(2);
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy("save"); setErr(null); setMsg(null);
    const r = await api<{ version: number; note: string }>("/api/admin/policy", { method: "POST", body: { useStart: start, useEnd: end, graceMinutes: Number(grace), timezone: "Asia/Kolkata" } });
    setBusy(null);
    if (!r.ok) { setErr(r.error); return; }
    setMsg(`Saved as version ${r.data.version}. ${r.data.note}`); reload();
  }
  async function demo() {
    setBusy("demo"); setErr(null); setMsg(null);
    const r = await api<{ deadline: string }>("/api/admin/demo-cycle", { method: "POST", body: { minutes: Number(demoMin), graceMinutes: 1 } });
    setBusy(null);
    if (!r.ok) { setErr(r.error); return; }
    setMsg(`Demo cycle started. Deposit deadline ${fmtTime(r.data.deadline)}. Phones not in custody by then raise a real overdue alert.`); reload();
  }
  async function endDemo() {
    setBusy("end"); const r = await api("/api/admin/demo-cycle", { method: "DELETE" }); setBusy(null);
    if (!r.ok) setErr(r.error); else { setMsg("Demo cycle ended. The scheduled policy applies again."); reload(); }
  }
  const crosses = end <= start;
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Card className="min-w-0 p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-lg font-bold"><Timer className="size-5 text-teal-600" aria-hidden />Permitted phone-use window</h2>
        <p className="mt-1 text-sm text-navy-500">Evaluated in Asia/Kolkata. Stored in UTC. Each day&apos;s cycle keeps a snapshot of the policy it started with.</p>
        <form onSubmit={save} className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-2 2xl:grid-cols-3">
          <Field id="p-start" label="Phones out from"><input id="p-start" type="time" className={inputCls} value={start} onChange={(e) => setStart(e.target.value)} required /></Field>
          <Field id="p-end" label="Return by"><input id="p-end" type="time" className={inputCls} value={end} onChange={(e) => setEnd(e.target.value)} required /></Field>
          <div className="lg:col-span-2 2xl:col-span-1"><Field id="p-grace" label="Grace (minutes)"><input id="p-grace" type="number" inputMode="numeric" min={0} max={240} className={inputCls} value={grace} onChange={(e) => setGrace(Number(e.target.value))} required /></Field></div>
          <div className="flex items-start gap-2 rounded-2xl bg-sand-50 px-4 py-3 text-sm text-navy-700 ring-1 ring-sand-200 sm:col-span-3 lg:col-span-2 2xl:col-span-3">
            <CalendarClock className="mt-0.5 size-4 shrink-0 text-navy-500" aria-hidden />
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <span>Deposit deadline <b>{hhmmLabel(end)}</b> + {grace} min grace</span>
              {crosses && <Pill tone="amber" icon={<Moon className="size-3.5" aria-hidden />}>Crosses midnight</Pill>}
            </div>
          </div>
          <Button type="submit" busy={busy === "save"} className="sm:col-span-3 lg:col-span-2 2xl:col-span-3">Save as new policy version</Button>
        </form>
        {(err || msg) && <div className="mt-4 flex flex-col gap-3"><ErrorBanner error={err} />{msg && <Banner tone="leaf" title="Saved">{msg}</Banner>}</div>}
      </Card>
      <Card className="min-w-0 p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-lg font-bold"><Clock className="size-5 text-amber-600" aria-hidden />Short demo deadline</h2>
        <p className="mt-1 text-sm text-navy-500">Starts a clearly labelled demo cycle now. The same overdue rules, alerts and resolution apply.</p>
        <div className="mt-5 flex flex-wrap items-end gap-3">
          <div className="w-36"><Field id="demo-min" label="Window (minutes)"><input id="demo-min" type="number" inputMode="numeric" min={1} max={60} className={inputCls} value={demoMin} onChange={(e) => setDemoMin(Number(e.target.value))} /></Field></div>
          <Button variant="amber" busy={busy === "demo"} onClick={demo} className="w-full sm:w-auto">Start demo cycle (+1 min grace)</Button>
          {o.cycle.isDemo && <Button variant="secondary" busy={busy === "end"} onClick={endDemo} className="w-full sm:w-auto">End demo</Button>}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-navy-700">
          <span>Current cycle</span>
          {o.cycle.isDemo ? <Pill tone="amber" icon={<Clock className="size-3.5" aria-hidden />}>Demo</Pill> : <Pill tone="sand" icon={<CalendarClock className="size-3.5" aria-hidden />}>Scheduled</Pill>}
          <span>deadline <b>{fmtDateTime(o.cycle.deadline)}</b></span>
        </div>
        <h3 className="mt-6 font-bold">Policy versions</h3>
        <ul className="mt-2 flex flex-col divide-y divide-sand-200 text-sm">
          {o.policies.map((p, i) => (
            <li key={p.id} className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-2">
              <span className="flex flex-wrap items-center gap-2"><b>v{p.version}</b><span>{hhmmLabel(p.use_start)}–{hhmmLabel(p.use_end)} · {p.grace_minutes} min grace</span>{i === 0 && <Pill tone="leaf" icon={<CheckCircle2 className="size-3.5" aria-hidden />}>Current</Pill>}</span>
              <span className="text-navy-500">{fmtDateTime(p.created_at)} · {p.created_by_name ?? "system"}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function AccountsTab({ o }: { o: Overview }) {
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [page, setPage] = useState(0);
  const u = useLive<{ users: User[] }>(`/api/admin/users?q=${encodeURIComponent(q)}&role=${role}&limit=25&offset=${page * 25}`, 60000);
  const [edit, setEdit] = useState<User | null>(null);
  const [creating, setCreating] = useState(false);
  const sideRef = useRef<HTMLDivElement>(null);
  // On narrow screens the editor sits below the list; bring it into view after selecting.
  function reveal() {
    requestAnimationFrame(() => {
      if (window.matchMedia("(max-width: 1023px)").matches) sideRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <Card className="min-w-0 p-4 sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center lg:flex-col lg:items-stretch xl:flex-row xl:items-center">
          <label className="relative min-w-0 flex-1"><span className="sr-only">Search accounts</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-navy-400" aria-hidden /><input type="search" className={`${inputCls} pl-9`} placeholder="Name, email or roll no." value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} /></label>
          <div className="flex gap-2">
            <select aria-label="Filter by role" className={`${inputCls} min-w-0 flex-1 sm:w-36 sm:flex-none`} value={role} onChange={(e) => { setRole(e.target.value); setPage(0); }}><option value="">All roles</option>{["student", "teacher", "warden", "admin"].map((r) => <option key={r} value={r}>{cap(r)}</option>)}</select>
            <Button className="shrink-0" onClick={() => { setCreating(true); setEdit(null); reveal(); }}><Plus className="size-4" aria-hidden />New account</Button>
          </div>
        </div>
        {u.error && <div className="mt-3"><ErrorBanner error={u.error} onRetry={u.reload} /></div>}
        {!u.data ? <Skeleton className="mt-3 h-64" /> : u.data.users.length === 0 ? <div className="mt-3"><Empty title="No accounts match" /></div> : (
          <ul className="mt-3 flex flex-col divide-y divide-sand-200" aria-label="Accounts">
            {u.data.users.map((x) => {
              const sel = edit?.id === x.id;
              const disabled = !Number(x.active);
              const meta = [x.roll_no, x.room ? `Room ${x.room}` : null].filter(Boolean).join(" · ");
              return (
                <li key={x.id} className="py-0.5">
                  <button aria-current={sel ? "true" : undefined} onClick={() => { setEdit(x); setCreating(false); reveal(); }}
                    className={cx("flex min-h-14 w-full min-w-0 flex-col gap-1 rounded-xl px-3 py-2.5 text-left transition-colors", sel ? "bg-teal-50 ring-1 ring-teal-100" : "hover:bg-sand-50")}>
                    <span className="flex w-full min-w-0 items-start justify-between gap-2">
                      <span className={cx("min-w-0 break-words font-semibold", disabled && "text-navy-500")}>{x.name}</span>
                      <span className="flex shrink-0 flex-wrap justify-end gap-1">
                        <Pill tone={x.role === "student" ? "sand" : "navy"} icon={ROLE_ICON[x.role]}>{cap(x.role)}</Pill>
                      </span>
                    </span>
                    <span className="block w-full truncate text-xs text-navy-500">{x.email}{meta ? ` · ${meta}` : ""}</span>
                    {x.phone && <span className="block w-full text-xs text-navy-500">{x.phone}{x.storage_slot ? ` · slot ${x.storage_slot}` : ""}</span>}
                    {(disabled || x.google_linked) ? (
                      <span className="flex flex-wrap gap-1">
                        {disabled && <Pill tone="rose" icon={<Ban className="size-3.5" aria-hidden />}>Disabled</Pill>}
                        {x.google_linked ? <Pill tone="teal" icon={<KeyRound className="size-3.5" aria-hidden />}>Google linked</Pill> : null}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-sand-200 pt-3">
          <p className="text-xs text-navy-500">Page {page + 1}</p>
          <div className="flex gap-2"><Button variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button><Button variant="secondary" disabled={(u.data?.users.length ?? 0) < 25} onClick={() => setPage(page + 1)}>Next</Button></div>
        </div>
      </Card>
      <div ref={sideRef} className="min-w-0 scroll-mt-24 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:self-start lg:overflow-y-auto lg:rounded-3xl">
        {creating && <CreateUser o={o} onDone={() => { setCreating(false); u.reload(); }} />}
        {edit && <EditUser key={edit.id} user={edit} o={o} onDone={() => { u.reload(); }} />}
        {!creating && !edit && <Empty icon={<Users className="size-6" aria-hidden />} title="Select an account">Assign hostel, room, roll number, registered phone and storage slot.</Empty>}
      </div>
    </div>
  );
}

function CreateUser({ o, onDone }: { o: Overview; onDone: () => void }) {
  const [f, setF] = useState({ name: "", email: "", role: "teacher", password: "", rollNo: "", hostelId: o.hostels[0]?.id ?? "", room: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ApiErr | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    const r = await api("/api/admin/users", { method: "POST", body: { ...f, password: f.password || undefined, rollNo: f.rollNo || undefined, room: f.room || undefined, hostelId: f.role === "student" || f.role === "warden" ? f.hostelId : undefined } });
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    onDone();
  }
  return (
    <Card className="p-5">
      <h2 className="flex items-center gap-2 text-lg font-bold"><Plus className="size-5 text-teal-600" aria-hidden />New account</h2>
      <p className="mt-1 text-sm text-navy-500">Only administrators can create staff accounts. Staff may sign in with Google using this email, or a password if set.</p>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
        <Field id="c-name" label="Full name"><input id="c-name" autoComplete="off" className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field>
        <Field id="c-email" label="Email"><input id="c-email" type="email" autoComplete="off" className={inputCls} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></Field>
        <Field id="c-role" label="Role"><select id="c-role" className={inputCls} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{["teacher", "warden", "admin", "student"].map((r) => <option key={r} value={r}>{cap(r)}</option>)}</select></Field>
        {(f.role === "student" || f.role === "warden") && <Field id="c-hostel" label="Hostel"><select id="c-hostel" className={inputCls} value={f.hostelId} onChange={(e) => setF({ ...f, hostelId: e.target.value })}>{o.hostels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select></Field>}
        {f.role === "student" && <div className="grid grid-cols-2 gap-3"><Field id="c-roll" label="Roll no."><input id="c-roll" className={inputCls} value={f.rollNo} onChange={(e) => setF({ ...f, rollNo: e.target.value })} /></Field><Field id="c-room" label="Room"><input id="c-room" className={inputCls} value={f.room} onChange={(e) => setF({ ...f, room: e.target.value })} /></Field></div>}
        <Field id="c-pw" label="Password (optional)" hint="At least 10 characters. Leave blank for Google sign-in only."><input id="c-pw" type="password" autoComplete="new-password" className={inputCls} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} minLength={10} /></Field>
        <ErrorBanner error={err} />
        <Button type="submit" busy={busy}>Create account</Button>
      </form>
    </Card>
  );
}

function EditUser({ user, o, onDone }: { user: User; o: Overview; onDone: () => void }) {
  const [f, setF] = useState({ role: user.role, rollNo: user.roll_no ?? "", room: user.room ?? "", hostelId: user.hostel_id ?? "", phone: user.phone ?? "", slot: user.storage_slot ?? "", active: Boolean(Number(user.active)) });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ApiErr | null>(null);
  const [ok, setOk] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null); setOk(false);
    const phoneChanged = f.phone && f.slot && (f.phone !== user.phone || f.slot !== user.storage_slot);
    const r = await api(`/api/admin/users/${user.id}`, { method: "PATCH", body: {
      role: f.role, active: f.active, rollNo: f.rollNo || null, room: f.room || null, hostelId: f.hostelId || null,
      phone: phoneChanged ? { description: f.phone, storageSlot: f.slot } : undefined,
      wardenHostelId: f.role === "warden" && f.hostelId ? f.hostelId : undefined,
    } });
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setOk(true); onDone();
  }
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="break-words text-lg font-bold">{user.name}</h2>
          <p className="break-all text-sm text-navy-500">{user.email}</p>
        </div>
        {Number(user.active)
          ? <Pill tone="leaf" icon={<CheckCircle2 className="size-3.5" aria-hidden />}>Active</Pill>
          : <Pill tone="rose" icon={<Ban className="size-3.5" aria-hidden />}>Disabled</Pill>}
      </div>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Field id="e-role" label="Role"><select id="e-role" className={inputCls} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{["student", "teacher", "warden", "admin"].map((r) => <option key={r} value={r}>{cap(r)}</option>)}</select></Field>
          <Field id="e-hostel" label="Hostel"><select id="e-hostel" className={inputCls} value={f.hostelId} onChange={(e) => setF({ ...f, hostelId: e.target.value })}><option value="">None</option>{o.hostels.map((h) => <option key={h.id} value={h.id}>{h.code}</option>)}</select></Field>
          <Field id="e-roll" label="Roll no."><input id="e-roll" className={inputCls} value={f.rollNo} onChange={(e) => setF({ ...f, rollNo: e.target.value })} /></Field>
          <Field id="e-room" label="Room"><input id="e-room" className={inputCls} value={f.room} onChange={(e) => setF({ ...f, room: e.target.value })} /></Field>
        </div>
        {f.role === "student" && <>
          <Field id="e-phone" label="Registered phone"><input id="e-phone" className={inputCls} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="Model, colour, case" /></Field>
          <Field id="e-slot" label="Storage slot"><input id="e-slot" className={inputCls} value={f.slot} onChange={(e) => setF({ ...f, slot: e.target.value })} placeholder="B-12" /></Field>
        </>}
        <label htmlFor="e-active" className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-1 font-medium">
          <input id="e-active" type="checkbox" className="size-5 shrink-0 accent-teal-700" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />
          Account active
          <span className="text-xs font-normal text-navy-500">{f.active ? "Can sign in" : "Sign-in blocked"}</span>
        </label>
        <ErrorBanner error={err} />
        {ok && <Banner tone="leaf" title="Saved">Changes recorded in the audit history.</Banner>}
        <Button type="submit" busy={busy}>Save changes</Button>
      </form>
    </Card>
  );
}

function ClassesTab({ o, reload }: { o: Overview; reload: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<ApiErr | null>(null);
  const [nf, setNf] = useState({ name: "", subjectCode: "", teacherId: o.teachers[0]?.id ?? "" });
  async function assign(classId: string, teacherId: string) {
    setBusy(classId); setErr(null);
    const r = await api("/api/admin/classes", { method: "POST", body: { classId, teacherId } });
    setBusy(null); if (!r.ok) setErr(r.error); else reload();
  }
  async function create(e: React.FormEvent) {
    e.preventDefault(); setBusy("new"); setErr(null);
    const r = await api("/api/admin/classes", { method: "POST", body: nf });
    setBusy(null); if (!r.ok) setErr(r.error); else { setNf({ ...nf, name: "", subjectCode: "" }); reload(); }
  }
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Card className="min-w-0 p-5">
        <h2 className="flex items-center gap-2 text-lg font-bold"><BookOpen className="size-5 text-teal-600" aria-hidden />Classes and teacher assignments</h2>
        {err && <div className="mt-3"><ErrorBanner error={err} /></div>}
        {o.classes.length === 0 ? <div className="mt-3"><Empty title="No classes yet">Create one with the form.</Empty></div> : (
          <ul className="mt-2 flex flex-col divide-y divide-sand-200">
            {o.classes.map((c) => (
              <li key={c.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div className="min-w-0"><p className="break-words font-semibold">{c.name}</p><p className="text-xs text-navy-500">{c.subject_code} · class code <CodeText code={c.enroll_code} /></p></div>
                <div className="flex flex-col gap-1 sm:w-60 sm:shrink-0">
                  <label htmlFor={`t-${c.id}`} className="text-xs font-semibold text-navy-600">Teacher</label>
                  <select id={`t-${c.id}`} disabled={busy === c.id} aria-busy={busy === c.id || undefined} className={cx(inputCls, "disabled:opacity-60")} value={c.teacher_id} onChange={(e) => assign(c.id, e.target.value)}>{o.teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
                </div>
              </li>
            ))}
          </ul>
        )}
        <h3 className="mt-6 flex items-center gap-2 font-bold"><ShieldCheck className="size-4 text-teal-600" aria-hidden />Wardens</h3>
        <ul className="mt-2 flex flex-col divide-y divide-sand-200 text-sm">
          {o.wardens.map((w) => {
            const h = o.hostels.find((x) => x.id === w.hostel_id);
            return (
              <li key={w.id + (w.hostel_id ?? "")} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="font-semibold">{w.name}</span>
                {h ? <Pill tone="sand">{h.name}</Pill> : <Pill tone="amber" icon={<AlertTriangle className="size-3.5" aria-hidden />}>No hostel</Pill>}
              </li>
            );
          })}
        </ul>
      </Card>
      <Card className="h-fit min-w-0 p-5">
        <h2 className="flex items-center gap-2 text-lg font-bold"><Plus className="size-5 text-teal-600" aria-hidden />New class</h2>
        <form onSubmit={create} className="mt-3 flex flex-col gap-3">
          <Field id="n-name" label="Class name"><input id="n-name" className={inputCls} value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} required /></Field>
          <Field id="n-code" label="Subject code"><input id="n-code" className={inputCls} value={nf.subjectCode} onChange={(e) => setNf({ ...nf, subjectCode: e.target.value })} required /></Field>
          <Field id="n-t" label="Teacher"><select id="n-t" className={inputCls} value={nf.teacherId} onChange={(e) => setNf({ ...nf, teacherId: e.target.value })}>{o.teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
          <Button type="submit" busy={busy === "new"}>Create class</Button>
        </form>
      </Card>
    </div>
  );
}

function AuditTab() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const a = useLive<{ events: { id: string; action: string; entity_type: string; detail: string | null; created_at: string; actor_name: string | null; subject_name: string | null; subject_roll: string | null }[] }>(`/api/admin/audit?q=${encodeURIComponent(q)}&limit=25&offset=${page * 25}`, 20000);
  return (
    <Card className="min-w-0 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="flex items-center gap-2 text-lg font-bold"><FileClock className="size-5 text-teal-600" aria-hidden />Audit history</h2>
        <label className="relative w-full sm:max-w-sm"><span className="sr-only">Search audit history</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-navy-400" aria-hidden /><input type="search" className={`${inputCls} pl-9`} placeholder="Action, person or roll no." value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} /></label>
      </div>
      <p className="mt-1 text-xs text-navy-500">Try “custody” or a roll number such as H024.</p>
      {a.error && <div className="mt-3"><ErrorBanner error={a.error} onRetry={a.reload} /></div>}
      {!a.data ? <Skeleton className="mt-3 h-64" /> : a.data.events.length === 0 ? <div className="mt-3"><Empty title="No events match" /></div> : (
        <div className="-mx-4 mt-3 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="region" aria-label="Audit events (scrolls sideways)" tabIndex={0}>
          <table className="w-full min-w-[680px] text-left text-sm">
            <caption className="sr-only">Audit events, newest first</caption>
            <thead className="border-b border-sand-200 text-xs uppercase tracking-wide text-navy-500"><tr><th scope="col" className="py-2 pr-3 font-semibold">When</th><th scope="col" className="py-2 pr-3 font-semibold">Action</th><th scope="col" className="py-2 pr-3 font-semibold">By</th><th scope="col" className="py-2 pr-3 font-semibold">Student</th><th scope="col" className="py-2 font-semibold">Detail</th></tr></thead>
            <tbody className="divide-y divide-sand-200">
              {a.data.events.map((e) => (
                <tr key={e.id} className="align-top">
                  <td className="whitespace-nowrap py-2.5 pr-3 text-navy-600">{fmtDateTime(e.created_at)}</td>
                  <td className="py-2.5 pr-3"><code className="whitespace-nowrap rounded bg-sand-100 px-1.5 py-0.5 text-xs">{e.action}</code></td>
                  <td className="py-2.5 pr-3">{e.actor_name ?? "System scheduler"}</td>
                  <td className="py-2.5 pr-3">{e.subject_name ? `${e.subject_name}${e.subject_roll ? ` (${e.subject_roll})` : ""}` : "—"}</td>
                  <td className="max-w-xs py-2.5 text-xs text-navy-500"><span className="line-clamp-2 break-words" title={e.detail ?? ""}>{e.detail ?? ""}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-sand-200 pt-3">
        <p className="text-xs text-navy-500">Page {page + 1}</p>
        <div className="flex gap-2"><Button variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>Newer</Button><Button variant="secondary" disabled={(a.data?.events.length ?? 0) < 25} onClick={() => setPage(page + 1)}>Older</Button></div>
      </div>
    </Card>
  );
}
