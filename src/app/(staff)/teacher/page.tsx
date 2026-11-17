"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronRight, Play, UserPlus } from "lucide-react";
import { api, fmtDateTime, type ApiErr } from "@/lib/client";
import { useLive } from "@/components/use-live";
import { Banner, Button, Card, CodeText, Empty, ErrorBanner, LastUpdated, Pill, Skeleton, cx } from "@/components/ui";
import { ActionButton } from "@/components/teacher/action-button";
import { LivePanel, Projector } from "@/components/teacher/live-panel";
import { PendingPanel } from "@/components/teacher/pending-panel";
import { RosterPanel } from "@/components/teacher/roster-panel";
import { SessionTabBar } from "@/components/teacher/tab-bar";
import type { Classes, Session, Tab } from "@/components/teacher/types";

export default function TeacherPage() {
  const cls = useLive<Classes>("/api/teacher/classes", 20000);
  const [classId, setClassId] = useState<string | null>(null);
  const current = cls.data?.classes.find((c) => c.id === classId) ?? cls.data?.classes[0] ?? null;
  const [sessionId, setSessionId] = useState<string | null>(null);
  const sid = sessionId ?? current?.active_session_id ?? null;
  const ses = useLive<Session>(sid ? `/api/teacher/sessions/${sid}` : null, 4000);
  const [err, setErr] = useState<ApiErr | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [projector, setProjector] = useState(false);
  const [finalResult, setFinalResult] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("live");

  useEffect(() => { setSessionId(null); setFinalResult(null); setTab("live"); }, [classId]); // eslint-disable-line react-hooks/set-state-in-effect

  async function run<T>(key: string, fn: () => Promise<{ ok: true; data: T } | { ok: false; error: ApiErr }>, after?: (d: T) => void) {
    setBusy(key); setErr(null);
    const r = await fn();
    setBusy(null);
    if (!r.ok) { setErr(r.error); return false; }
    after?.(r.data);
    await Promise.all([ses.reload(), cls.reload()]);
    return true;
  }

  const startSession = () => run<{ sessionId: string }>("start", () => api("/api/teacher/sessions", { method: "POST", body: { classId: current!.id } }), (d) => { setSessionId(d.sessionId); setTab("live"); });
  const act = (action: string) => run<{ markedAbsent?: number }>(action, () => api(`/api/teacher/sessions/${sid}`, { method: "POST", body: { action } }), (d) => {
    // Pin the session id so the summary stays on screen once the class no longer reports it as active.
    if (action === "finalize") { setSessionId(sid); setFinalResult(`Finalized. ${d.markedAbsent ?? 0} student(s) who never joined were recorded Absent.`); }
    if (action === "close" || action === "finalize" || action === "reopen") setTab("live");
  });
  const mark = (ids: string[], status: string, manualReason?: string) => run(`mark:${ids.join(",")}:${status}`, () => api("/api/teacher/records", { method: "POST", body: { sessionId: sid, studentIds: ids, status, manualReason } }));
  const decide = (studentId: string, decision: "approved" | "rejected") => run(`en:${studentId}:${decision}`, () => api("/api/teacher/enrollments", { method: "POST", body: { classId: current!.id, studentId, decision } }));

  const s = ses.data?.session.id === sid ? ses.data : null;
  const pending = useMemo(() => s?.roster.filter((r) => r.status === "pending") ?? [], [s]);
  const joinRequests = current ? cls.data?.pending.filter((p) => p.class_id === current.id) ?? [] : [];
  const closeProjector = useCallback(() => setProjector(false), []);

  const goTab = (t: Tab) => {
    setTab(t);
    requestAnimationFrame(() => document.getElementById(`panel-${t}`)?.scrollIntoView({ block: "start", behavior: "smooth" }));
  };

  const title = !s ? "Attendance" : s.session.status === "open" ? "Live attendance" : s.session.status === "closed" ? "Finish attendance" : "Attendance summary";
  const stale = ses.stale || cls.stale;

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <header className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-navy-500">hostelpass <span aria-hidden>/</span> teacher</p>
          <LastUpdated at={ses.at ?? cls.at} stale={stale} />
        </div>
        <h1 className="text-3xl font-extrabold leading-tight">{title}</h1>
        {current && <p className="truncate text-sm text-navy-500">{current.name} · {current.subject_code}</p>}
      </header>

      {cls.loading ? <Skeleton className="h-12" /> : !cls.data?.classes.length ? <Empty title="No classes assigned">Ask the college office to assign you a class.</Empty> : cls.data.classes.length > 1 && (
        <div role="radiogroup" aria-label="Class" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0">
          {cls.data.classes.map((c) => {
            const on = c.id === current?.id;
            return (
              <button key={c.id} role="radio" aria-checked={on} onClick={() => setClassId(c.id)} title={`${c.name} · ${c.subject_code} · ${c.enrolled} students`}
                className={cx("flex min-h-11 max-w-[16rem] shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold ring-1 transition-colors",
                  on ? "bg-navy-900 text-white ring-navy-900" : "bg-white text-navy-800 ring-sand-300 hover:bg-sand-100")}>
                {c.active_session_id && <span className="size-2 shrink-0 rounded-full bg-leaf-600 ring-2 ring-white" aria-hidden />}
                <span className="truncate">{c.name}</span>
                <span className={cx("shrink-0 text-xs font-medium", on ? "text-white/70" : "text-navy-500")}>{c.subject_code}{c.active_session_id ? " · live" : ""}</span>
              </button>
            );
          })}
        </div>
      )}

      <ErrorBanner error={err} />
      {ses.error && ses.error.code !== "OFFLINE" && !s && <ErrorBanner error={ses.error} onRetry={ses.reload} />}
      {stale && <Banner tone="amber" title="Offline">Showing the last known roster. Actions are disabled until the connection returns.</Banner>}

      {current && !sid && <>
        <div className="campus-hero grain relative overflow-hidden rounded-3xl p-5 text-white shadow-lift sm:p-6">
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm text-white/70">{current.subject_code} · {current.enrolled} students</p>
              <h2 className="text-2xl font-extrabold">{current.name}</h2>
              <p className="mt-1 text-sm text-white/75">Class join code for new students: <CodeText code={current.enroll_code} className="whitespace-nowrap text-teal-100" /></p>
            </div>
            <ActionButton tone="mint" size="lg" className="w-full sm:w-auto" onClick={startSession} busy={busy === "start"} disabled={stale}><Play className="size-5" aria-hidden />Start session</ActionButton>
          </div>
        </div>
        <JoinRequests list={joinRequests} busy={busy} decide={decide} />
        <Card className="p-4 sm:p-5">
          <h2 className="font-bold">Recent sessions</h2>
          <ul className="mt-2 flex flex-col divide-y divide-sand-200 text-sm">
            {cls.data?.recent.filter((r) => r.class_id === current.id).map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5">
                <span className="min-w-0">
                  <span className="block font-semibold">{fmtDateTime(r.opened_at)}</span>
                  <span className="text-navy-500">{r.present_count}/{r.total} present</span>
                </span>
                <span className="flex items-center gap-2">
                  <Pill tone={r.status === "finalized" ? "sand" : "amber"} icon={r.status === "finalized" ? <CheckCircle2 className="size-3" aria-hidden /> : undefined}>{r.status[0].toUpperCase() + r.status.slice(1)}</Pill>
                  {r.status !== "finalized" && <Button variant="ghost" onClick={() => setSessionId(r.id)} aria-label={`Open session from ${fmtDateTime(r.opened_at)}`}>Open<ChevronRight className="size-4" aria-hidden /></Button>}
                </span>
              </li>
            ))}
            {!cls.data?.recent.some((r) => r.class_id === current.id) && <li className="py-2 text-navy-500">No sessions yet.</li>}
          </ul>
        </Card>
      </>}

      {sid && !s && !(ses.error && ses.error.code !== "OFFLINE") && <div className="flex flex-col gap-4"><Skeleton className="h-44" /><Skeleton className="h-28" /><Skeleton className="h-14" /></div>}

      {s && <>
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(320px,400px)_minmax(0,1fr)] xl:items-start">
          <section id="panel-live" role="tabpanel" aria-labelledby="tab-live" className={cx("min-w-0 scroll-mt-24 flex-col gap-4 xl:flex", tab === "live" ? "flex" : "hidden")}>
            <LivePanel s={s} busy={busy} stale={stale} finalResult={finalResult} act={act} onProjector={() => setProjector(true)} onReview={() => goTab("pending")} onExpire={ses.reload}
              onBack={() => { setSessionId(null); setTab("live"); cls.reload(); }} />
            <JoinRequests list={joinRequests} busy={busy} decide={decide} />
          </section>
          <div className="flex min-w-0 flex-col gap-5">
            <section id="panel-pending" role="tabpanel" aria-labelledby="tab-pending" className={cx("min-w-0 scroll-mt-24 xl:block", tab === "pending" ? "block" : "hidden")}>
              <PendingPanel pending={pending} busy={busy} mark={mark} locked={s.session.status === "finalized" || stale} />
            </section>
            <section id="panel-roster" role="tabpanel" aria-labelledby="tab-roster" className={cx("min-w-0 scroll-mt-24 xl:block", tab === "roster" ? "block" : "hidden")}>
              <RosterPanel s={s} busy={busy} mark={mark} />
            </section>
          </div>
        </div>
        <div className="h-20 xl:hidden" aria-hidden />
        <SessionTabBar tab={tab} onTab={goTab} pending={pending.length} status={s.session.status} />
      </>}

      {projector && s?.join && <Projector s={s} onClose={closeProjector} />}
    </div>
  );
}

function JoinRequests({ list, busy, decide }: { list: Classes["pending"]; busy: string | null; decide: (id: string, d: "approved" | "rejected") => Promise<boolean> }) {
  if (!list.length) return null;
  return (
    <details className="group rounded-3xl bg-white shadow-card ring-1 ring-sand-200/70" open={list.length <= 2}>
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-2 rounded-3xl px-4 font-bold sm:px-5 [&::-webkit-details-marker]:hidden">
        <UserPlus className="size-4 text-amber-600" aria-hidden />Class join requests
        <Pill tone="amber">{list.length}</Pill>
        <ChevronRight className="ml-auto size-5 text-navy-500 transition-transform group-open:rotate-90" aria-hidden />
      </summary>
      <ul className="flex flex-col divide-y divide-sand-200 px-4 pb-2 sm:px-5">
        {list.map((p) => (
          <li key={p.student_id} className="flex flex-col gap-2 py-3">
            <div className="min-w-0">
              <p className="font-semibold">{p.name}</p>
              <p className="break-words text-xs text-navy-500">{p.roll_no ?? "no roll no."} · {p.email} · {fmtDateTime(p.requested_at)}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button busy={busy === `en:${p.student_id}:approved`} onClick={() => decide(p.student_id, "approved")}><CheckCircle2 className="size-4" aria-hidden />Approve</Button>
              <Button variant="secondary" busy={busy === `en:${p.student_id}:rejected`} onClick={() => decide(p.student_id, "rejected")}>Decline</Button>
            </div>
          </li>
        ))}
      </ul>
    </details>
  );
}
