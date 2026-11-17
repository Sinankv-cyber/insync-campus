"use client";
import { useState } from "react";
import { AlertTriangle, BellRing, CheckCircle2, Clock3, IdCard, Inbox, Keyboard, PackageCheck, ScanLine, Search, ShieldCheck, ShieldPlus, Smartphone, Undo2, Users, X } from "lucide-react";
import { api, fmtDateTime, fmtTime, relTime, type ApiErr } from "@/lib/client";
import { useLive } from "@/components/use-live";
import { Scanner, CodeInput } from "@/components/scanner";
import { Banner, Button, Card, Countdown, CustodyPill, Empty, ErrorBanner, Field, LastUpdated, Pill, Skeleton, Stat, cx, inputCls } from "@/components/ui";

type Custody = { status: string; phone: { description: string; storage_slot: string } | null; activeReceipt: { deposited_at: string; storage_slot: string } | null; exception: { reason: string; expires_at: string; status: string } | null; openAlert: { created_at: string } | null };
type Today = {
  serverTime: string;
  cycle: { isDemo: boolean; deadline: string; windowStart: string; windowEnd: string; useStart: string; useEnd: string; graceMinutes: number };
  counts: { expected: number; deposited: number; due: number; overdue: number; exempt: number; noPhone: number };
  students: { id: string; name: string; roll_no: string; room: string; custody: Custody }[];
  total: number; limit: number; offset: number;
  alerts: { id: string; status: string; created_at: string; resolved_at: string | null; student_id: string; name: string; roll_no: string; room: string; deadline: string; is_demo: number }[];
  exceptionRequests: { id: string; reason: string; expires_at: string; created_at: string; student_id: string; name: string; roll_no: string; room: string }[];
  recentReceipts: { id: string; deposited_at: string; returned_at: string | null; deposit_method: string; return_method: string | null; storage_slot: string; name: string; roll_no: string; room: string }[];
};
type SCard = { id: string; name: string; roll_no: string; room: string; hostel_name?: string; phone: string | null; storage_slot: string | null; active_receipt_id: string | null; deposited_at: string | null };
type Review = { mode: "deposit" | "collect"; via: "qr" | "code" | "id_lookup"; credentialId?: string; expiresAt?: string; student: SCard };

export default function WardenPage() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(0);
  const path = `/api/warden/today?limit=25&offset=${page * 25}&filter=${filter}&q=${encodeURIComponent(q)}`;
  const t = useLive<Today>(path, 10000);
  const d = t.data;
  const [panel, setPanel] = useState<"scan" | "code" | "lookup">("scan");
  const [review, setReview] = useState<Review | null>(null);
  const [done, setDone] = useState<{ title: string; body: string } | null>(null);
  const [err, setErr] = useState<ApiErr | null>(null);

  async function resolve(raw: string, via: "qr" | "code") {
    setErr(null); setDone(null);
    const r = await api<{ credentialId: string; purpose: "deposit" | "collect"; expiresAt: string; student: SCard }>("/api/warden/resolve", { method: "POST", body: { code: raw } });
    if (!r.ok) { setErr(r.error); return; }
    setReview({ mode: r.data.purpose, via, credentialId: r.data.credentialId, expiresAt: r.data.expiresAt, student: r.data.student });
  }

  const overdueSoon = d && d.cycle.deadline > d.serverTime;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold sm:text-3xl">Warden Today</h1>
          {d && <p className="flex flex-wrap items-center gap-2 text-navy-500">
            <Clock3 className="size-4" aria-hidden />Deposit due at <b className="text-navy-900">{fmtTime(d.cycle.deadline)}</b>
            {overdueSoon ? <Pill tone="amber"><Countdown to={d.cycle.deadline} onExpire={t.reload} /> left</Pill> : <Pill tone="rose">Deadline passed</Pill>}
            {d.cycle.isDemo && <Pill tone="navy">Demo cycle</Pill>}
          </p>}
        </div>
        <LastUpdated at={t.at} stale={t.stale} />
      </div>
      {t.stale && <Banner tone="amber" title="Offline — last known counts">Confirmations are disabled until the connection returns. Nothing shown here is newly confirmed.</Banner>}

      {t.loading ? <Skeleton className="h-28" /> : d && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="Expected" value={d.counts.expected} tone="sand" icon={<Users className="size-3.5" aria-hidden />} />
          <Stat label="Deposited" value={d.counts.deposited} tone="leaf" icon={<ShieldCheck className="size-3.5" aria-hidden />} />
          <Stat label="Due" value={d.counts.due} tone="teal" icon={<Smartphone className="size-3.5" aria-hidden />} />
          <Stat label="Overdue" value={d.counts.overdue} tone="rose" icon={<AlertTriangle className="size-3.5" aria-hidden />} />
          <Stat label="Exempt" value={d.counts.exempt} tone="navy" icon={<ShieldPlus className="size-3.5" aria-hidden />} />
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(340px,440px)_1fr]">
        {/* Scan / enter / lookup */}
        <div className="flex flex-col gap-4 xl:sticky xl:top-6 xl:h-fit">
          <Card className="p-4 sm:p-5">
            {!review ? (
              <>
                <div role="tablist" aria-label="Find student" className="grid grid-cols-3 gap-1 rounded-2xl bg-sand-100 p-1">
                  {([["scan", ScanLine, "Scan"], ["code", Keyboard, "Code"], ["lookup", IdCard, "ID lookup"]] as const).map(([k, I, label]) => (
                    <button key={k} role="tab" aria-selected={panel === k} onClick={() => { setPanel(k); setErr(null); }}
                      className={cx("flex min-h-11 items-center justify-center gap-1.5 rounded-xl text-sm font-semibold", panel === k ? "bg-white shadow-sm" : "text-navy-600")}>
                      <I className="size-4" aria-hidden />{label}
                    </button>
                  ))}
                </div>
                <div className="mt-4">
                  {panel === "scan" && <Scanner onResult={(txt) => resolve(txt, "qr")} onUseCode={() => setPanel("code")} />}
                  {panel === "code" && <CodeEntry onSubmit={(c) => resolve(c, "code")} disabled={t.stale} />}
                  {panel === "lookup" && <Lookup onPick={(s, mode) => setReview({ mode, via: "id_lookup", student: s })} />}
                </div>
                <div className="mt-3"><ErrorBanner error={err} /></div>
                {done && <div className="mt-3"><Banner tone="leaf" title={done.title}>{done.body}</Banner></div>}
              </>
            ) : (
              <ReviewPanel review={review} disabled={t.stale} onCancel={() => setReview(null)} onDone={(title, body) => { setReview(null); setDone({ title, body }); t.reload(); }} />
            )}
          </Card>
          <AlertsInbox d={d} />
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <ExceptionsCard d={d} reload={t.reload} students={d?.students ?? []} />

          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-bold">Hostel roster</h2>
              <label className="relative w-full sm:max-w-xs"><span className="sr-only">Search roster</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-navy-300" aria-hidden />
                <input placeholder="Name, roll no. or room" className={`${inputCls} pl-9`} value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
              </label>
            </div>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="radiogroup" aria-label="Filter">
              {[["all", "All"], ["overdue", "Overdue"], ["due", "Due"], ["in_custody", "Deposited"], ["exempt", "Exempt"]].map(([k, l]) => (
                <button key={k} role="radio" aria-checked={filter === k} onClick={() => { setFilter(k); setPage(0); }}
                  className={cx("min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold ring-1", filter === k ? "bg-navy-900 text-white ring-navy-900" : "bg-white ring-sand-300 text-navy-700")}>{l}</button>
              ))}
            </div>
            {!d ? <Skeleton className="mt-3 h-64" /> : d.students.length === 0 ? <div className="mt-3"><Empty title="No students match" /></div> : (
              <ul className="mt-3 flex flex-col divide-y divide-sand-200">
                {d.students.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div className="min-w-0"><p className="font-semibold">{s.name} — {s.roll_no} — Room {s.room}</p>
                      <p className="text-xs text-navy-500">{s.custody.phone?.description ?? "No phone"}{s.custody.phone ? ` · Slot ${s.custody.phone.storage_slot}` : ""}{s.custody.activeReceipt ? ` · in since ${fmtTime(s.custody.activeReceipt.deposited_at)}` : ""}</p></div>
                    <div className="flex items-center gap-2">
                      <CustodyPill status={s.custody.status} />
                      {s.custody.status !== "no_phone" && (
                        <Button variant="ghost" onClick={() => { setReview({ mode: s.custody.activeReceipt ? "collect" : "deposit", via: "id_lookup", student: { id: s.id, name: s.name, roll_no: s.roll_no, room: s.room, phone: s.custody.phone?.description ?? null, storage_slot: s.custody.phone?.storage_slot ?? null, active_receipt_id: s.custody.activeReceipt ? "yes" : null, deposited_at: s.custody.activeReceipt?.deposited_at ?? null } }); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                          {s.custody.activeReceipt ? "Return" : "Receive"}
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {d && d.total > 25 && (
              <div className="mt-3 flex items-center justify-between text-sm">
                <span className="text-navy-500">{page * 25 + 1}–{Math.min(d.total, page * 25 + 25)} of {d.total}</span>
                <div className="flex gap-2"><Button variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button><Button variant="secondary" disabled={(page + 1) * 25 >= d.total} onClick={() => setPage(page + 1)}>Next</Button></div>
              </div>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="flex items-center gap-2 text-lg font-bold"><PackageCheck className="size-5 text-teal-600" aria-hidden />Recent receipts</h2>
            <ul className="mt-2 flex flex-col divide-y divide-sand-200 text-sm">
              {d?.recentReceipts.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span><b>{r.name}</b> — {r.roll_no} · Slot {r.storage_slot}</span>
                  <span className="text-navy-500">{r.returned_at ? `Returned ${fmtTime(r.returned_at)} (${r.return_method === "id_lookup" ? "ID" : r.return_method?.toUpperCase()})` : `Received ${fmtTime(r.deposited_at)} (${r.deposit_method === "id_lookup" ? "ID" : r.deposit_method.toUpperCase()})`}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

function CodeEntry({ onSubmit, disabled }: { onSubmit: (c: string) => Promise<void>; disabled?: boolean }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form onSubmit={async (e) => { e.preventDefault(); setBusy(true); await onSubmit(code); setBusy(false); }} className="flex flex-col gap-3">
      <Field id="warden-code" label="Code from the student's pass" hint={<span id="warden-code-hint">8 characters. Typing it does not record anything until you confirm.</span>}>
        <CodeInput id="warden-code" value={code} onChange={setCode} autoFocus />
      </Field>
      <Button type="submit" size="lg" busy={busy} disabled={code.replace("-", "").length !== 8 || disabled}>Look up pass</Button>
    </form>
  );
}

function Lookup({ onPick }: { onPick: (s: SCard, mode: "deposit" | "collect") => void }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<SCard[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ApiErr | null>(null);
  async function search(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    const r = await api<{ results: SCard[] }>(`/api/warden/lookup?q=${encodeURIComponent(q)}&limit=10`);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setRes(r.data.results);
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-navy-600">For students without their phone or pass — check their physical ID card.</p>
      <form onSubmit={search} className="flex gap-2">
        <label className="flex-1"><span className="sr-only">Roll number or name</span><input className={inputCls} placeholder="Roll no. (H024) or name" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <Button type="submit" busy={busy} disabled={q.trim().length < 2}><Search className="size-4" aria-hidden />Find</Button>
      </form>
      <ErrorBanner error={err} />
      {res && (res.length === 0 ? <Empty title="No student found in your hostel" /> : (
        <ul className="flex flex-col gap-2">
          {res.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-sand-50 p-3 ring-1 ring-sand-200">
              <div><p className="font-semibold">{s.name} — {s.roll_no}</p><p className="text-xs text-navy-500">Room {s.room} · {s.active_receipt_id ? `Phone in Slot ${s.storage_slot}` : "Phone with student"}</p></div>
              <Button onClick={() => onPick(s, s.active_receipt_id ? "collect" : "deposit")} variant={s.active_receipt_id ? "primary" : "secondary"}>{s.active_receipt_id ? "Return phone" : "Receive phone"}</Button>
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}

function ReviewPanel({ review, onCancel, onDone, disabled }: { review: Review; onCancel: () => void; onDone: (title: string, body: string) => void; disabled?: boolean }) {
  const [checked, setChecked] = useState(false);
  const [note, setNote] = useState(review.via === "id_lookup" ? (review.mode === "deposit" ? "Student had no pass — verified ID card" : "Verified physical ID card") : "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ApiErr | null>(null);
  const s = review.student;
  const isDeposit = review.mode === "deposit";
  async function confirm() {
    setBusy(true); setErr(null);
    const body = isDeposit
      ? { credentialId: review.credentialId, studentId: review.credentialId ? undefined : s.id, method: review.via, note: note || undefined, physicallyChecked: true }
      : { credentialId: review.credentialId, studentId: review.credentialId ? undefined : s.id, method: review.via, note: note || undefined, identityVerified: true };
    const r = await api<{ storageSlot?: string }>(isDeposit ? "/api/warden/deposit" : "/api/warden/return", { method: "POST", body });
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    onDone(isDeposit ? `Phone received, Slot ${r.data.storageSlot ?? s.storage_slot}` : "Phone returned", `${s.name} — ${s.roll_no} — Room ${s.room}. Saved ${fmtTime(new Date().toISOString())}.`);
  }
  return (
    <div className="rise flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Pill tone={isDeposit ? "teal" : "navy"} icon={isDeposit ? <Smartphone className="size-3.5" aria-hidden /> : <Undo2 className="size-3.5" aria-hidden />}>{isDeposit ? "Deposit" : "Collection"} · {review.via === "id_lookup" ? "ID lookup" : review.via === "qr" ? "QR scan" : "Typed code"}</Pill>
        <button onClick={onCancel} className="grid size-11 place-items-center rounded-xl hover:bg-sand-100" aria-label="Cancel"><X className="size-5" aria-hidden /></button>
      </div>
      <div className="rounded-3xl bg-navy-900 p-5 text-white">
        <p className="text-2xl font-extrabold">{s.name}</p>
        <p className="mt-1 text-white/75">{s.roll_no} · Room {s.room}</p>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-2xl bg-white/10 p-3"><dt className="text-white/60">Registered phone</dt><dd className="font-semibold">{s.phone ?? "—"}</dd></div>
          <div className="rounded-2xl bg-teal-500 p-3 text-navy-950"><dt className="font-semibold opacity-80">Storage slot</dt><dd className="text-2xl font-extrabold">{s.storage_slot ?? "—"}</dd></div>
        </dl>
        {review.expiresAt && <p className="mt-3 text-xs text-white/60">Pass expires {relTime(review.expiresAt)}</p>}
      </div>
      <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl bg-sand-50 p-3 ring-1 ring-sand-200">
        <input type="checkbox" className="mt-1 size-5 accent-teal-700" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
        <span className="text-sm font-semibold">{isDeposit ? "I have the phone in hand and it matches the registered description." : "I checked the student's identity (ID card / face) and am handing back their phone."}</span>
      </label>
      {review.via === "id_lookup" && <Field id="rv-note" label="Reason / note (recorded)"><input id="rv-note" className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} /></Field>}
      <ErrorBanner error={err} />
      <Button size="lg" className="min-h-16 text-lg" busy={busy} disabled={!checked || disabled || (review.via === "id_lookup" && note.trim().length < 3)} onClick={confirm}>
        <CheckCircle2 className="size-6" aria-hidden />{busy ? "Saving — not confirmed yet…" : isDeposit ? "Confirm phone received" : "Confirm phone returned"}
      </Button>
      <p className="text-center text-xs text-navy-500">Nothing is recorded until you confirm. The receipt is timestamped and audited.</p>
    </div>
  );
}

function AlertsInbox({ d }: { d: Today | null }) {
  const open = d?.alerts.filter((a) => a.status === "open") ?? [];
  const resolved = d?.alerts.filter((a) => a.status === "resolved") ?? [];
  return (
    <Card className="p-5">
      <h2 className="flex items-center gap-2 text-lg font-bold"><BellRing className="size-5 text-rose-600" aria-hidden />Alert inbox <span className="text-navy-500">({open.length})</span></h2>
      {open.length === 0 ? <div className="mt-3"><Empty icon={<Inbox className="size-6" aria-hidden />} title="No open alerts">Alerts appear when a phone is not deposited by the deadline.</Empty></div> : (
        <ul className="mt-3 flex flex-col gap-2">
          {open.map((a) => (
            <li key={a.id} className="rounded-2xl bg-rose-50 p-3 ring-1 ring-rose-600/20">
              <p className="flex items-center gap-1.5 text-sm font-bold text-rose-700"><AlertTriangle className="size-4" aria-hidden />Phone not deposited by the deadline</p>
              <p className="font-semibold">{a.name} — {a.roll_no} — Room {a.room}</p>
              <p className="text-xs text-navy-500">Due {fmtDateTime(a.deadline)}{a.is_demo ? " (demo)" : ""} · alert {relTime(a.created_at)}</p>
            </li>
          ))}
        </ul>
      )}
      {resolved.length > 0 && (
        <details className="mt-3"><summary className="min-h-11 cursor-pointer text-sm font-semibold leading-[44px] text-navy-600">Resolved recently ({resolved.length})</summary>
          <ul className="flex flex-col gap-1 text-sm">{resolved.map((a) => <li key={a.id} className="flex items-center gap-2"><CheckCircle2 className="size-4 text-leaf-600" aria-hidden />{a.name} — resolved {fmtTime(a.resolved_at)}</li>)}</ul>
        </details>
      )}
    </Card>
  );
}

function ExceptionsCard({ d, reload, students }: { d: Today | null; reload: () => void; students: Today["students"] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<ApiErr | null>(null);
  const [grant, setGrant] = useState(false);
  const [sid, setSid] = useState("");
  const [reason, setReason] = useState("");
  const [until, setUntil] = useState("");
  async function decide(id: string, decision: string) {
    setBusy(id + decision); setErr(null);
    const r = await api(`/api/exceptions/${id}`, { method: "POST", body: { decision } });
    setBusy(null);
    if (!r.ok) setErr(r.error); else reload();
  }
  async function create(e: React.FormEvent) {
    e.preventDefault(); setBusy("grant"); setErr(null);
    const r = await api("/api/exceptions", { method: "POST", body: { studentId: sid, reason, expiresAt: new Date(until).toISOString() } });
    setBusy(null);
    if (!r.ok) { setErr(r.error); return; }
    setGrant(false); setReason(""); setUntil(""); reload();
  }
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-bold"><ShieldPlus className="size-5 text-teal-600" aria-hidden />Exception requests <span className="text-navy-500">({d?.exceptionRequests.length ?? 0})</span></h2>
        <Button variant="secondary" onClick={() => setGrant(!grant)}>{grant ? "Cancel" : "Grant exception"}</Button>
      </div>
      <div className="mt-3"><ErrorBanner error={err} /></div>
      {grant && (
        <form onSubmit={create} className="mt-3 grid gap-3 rounded-2xl bg-sand-50 p-4 sm:grid-cols-2">
          <Field id="g-student" label="Student"><select id="g-student" className={inputCls} value={sid} onChange={(e) => setSid(e.target.value)} required><option value="">Choose…</option>{students.map((s) => <option key={s.id} value={s.id}>{s.name} — {s.roll_no}</option>)}</select></Field>
          <Field id="g-until" label="Expires"><input id="g-until" type="datetime-local" className={inputCls} value={until} onChange={(e) => setUntil(e.target.value)} required /></Field>
          <div className="sm:col-span-2"><Field id="g-reason" label="Reason"><input id="g-reason" className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} minLength={5} required /></Field></div>
          <Button type="submit" busy={busy === "grant"} className="sm:col-span-2">Approve exception</Button>
        </form>
      )}
      {d?.exceptionRequests.length ? (
        <ul className="mt-3 flex flex-col gap-2">
          {d.exceptionRequests.map((x) => (
            <li key={x.id} className="flex flex-col gap-2 rounded-2xl bg-amber-50 p-3 ring-1 ring-amber-100 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="font-semibold">{x.name} — {x.roll_no} — Room {x.room}</p><p className="text-sm text-navy-700">{x.reason}</p><p className="text-xs text-navy-500">Until {fmtDateTime(x.expires_at)} · asked {relTime(x.created_at)}</p></div>
              <div className="flex gap-2"><Button busy={busy === x.id + "approved"} onClick={() => decide(x.id, "approved")}>Approve</Button><Button variant="secondary" busy={busy === x.id + "rejected"} onClick={() => decide(x.id, "rejected")}>Decline</Button></div>
            </li>
          ))}
        </ul>
      ) : !grant && <p className="mt-2 text-sm text-navy-500">No pending requests.</p>}
    </Card>
  );
}
