"use client";
import { useEffect } from "react";
import { ArrowRight, Check, CheckCheck, CheckCircle2, Clock, Expand, Hourglass, Lock, RefreshCw, RotateCcw, ShieldCheck, Square, Users, X, XCircle } from "lucide-react";
import { fmtDateTime, fmtTime, formatCode } from "@/lib/client";
import { Banner, Button, Card, CodeText, Countdown, Pill, QR, cx } from "@/components/ui";
import { ActionButton } from "./action-button";
import type { Session } from "./types";

type Props = {
  s: Session;
  busy: string | null;
  stale: boolean;
  finalResult: string | null;
  act: (action: string) => Promise<boolean>;
  onProjector: () => void;
  onReview: () => void;
  onExpire: () => void;
  onBack: () => void;
};

export function StatusPill({ status }: { status: Session["session"]["status"] }) {
  if (status === "open") return <Pill tone="leaf" icon={<span className="size-2 rounded-full bg-leaf-600" aria-hidden />}>Open</Pill>;
  if (status === "closed") return <Pill tone="amber" icon={<Lock className="size-3" aria-hidden />}>Closed</Pill>;
  return <Pill tone="sand" icon={<CheckCheck className="size-3" aria-hidden />}>Finalized</Pill>;
}

/** Session controls: compact navy QR card, stats strip, then exactly one primary next step. */
export function LivePanel({ s, busy, stale, finalResult, act, onProjector, onReview, onExpire, onBack }: Props) {
  const { status } = s.session;
  return (
    <div className="flex flex-col gap-4">
      <div className="campus-hero grain relative overflow-hidden rounded-3xl p-4 text-white shadow-lift sm:p-5">
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="break-words font-bold leading-snug">{s.session.class_name}</p>
            <p className="text-xs text-white/70">{s.session.subject_code} · Opened {fmtTime(s.session.opened_at)}</p>
          </div>
          <StatusPill status={status} />
        </div>

        {s.join ? (
          <div className="relative mt-4 flex items-center gap-4 xl:flex-col xl:items-stretch">
            <button type="button" onClick={onProjector} aria-label="Show QR code full screen"
              className="w-28 shrink-0 rounded-2xl bg-white sm:w-36 xl:mx-auto xl:w-full xl:max-w-[340px]">
              <QR value={s.join.qrPayload} label="Attendance session QR code" />
            </button>
            <div className="min-w-0 flex-1 xl:text-center">
              <p className="text-xs font-semibold uppercase tracking-widest text-white/60">Join code</p>
              <CodeText code={s.join.code} className="block whitespace-nowrap text-2xl leading-tight sm:text-3xl xl:text-4xl" />
              <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-white/75 xl:justify-center">
                <Clock className="size-3.5" aria-hidden />Until {fmtTime(s.join.expiresAt)} · <Countdown to={s.join.expiresAt} className="font-semibold text-white" onExpire={onExpire} /> left
              </p>
              <ActionButton tone="light" className="mt-3 w-full" onClick={onProjector}><Expand className="size-4" aria-hidden />Show QR</ActionButton>
            </div>
          </div>
        ) : status === "open" ? (
          <div className="relative mt-4 rounded-2xl bg-white/10 p-3 ring-1 ring-white/15">
            <p className="flex items-center gap-2 font-semibold"><Clock className="size-4 text-amber-100" aria-hidden />Join code expired</p>
            <p className="mt-0.5 text-sm text-white/75">Issue a new code to let more students join.</p>
          </div>
        ) : (
          <p className="relative mt-3 flex items-center gap-2 text-sm text-white/75"><Lock className="size-4" aria-hidden />
            {status === "closed" ? `Closed ${fmtTime(s.session.closed_at)} · QR and code no longer work` : `Finalized ${fmtDateTime(s.session.finalized_at)} · records locked`}
          </p>
        )}

        {status === "open" && (
          <ActionButton tone="onDark" className="relative mt-3 w-full" busy={busy === "refresh_code"} disabled={stale} onClick={() => act("refresh_code")}>
            <RefreshCw className="size-4" aria-hidden />{s.join ? "New code" : "Issue new code"}
          </ActionButton>
        )}
      </div>

      <StatsStrip c={s.counts} />

      {status === "open" && <>
        {s.counts.pending > 0 && (
          <button type="button" onClick={onReview}
            className="flex min-h-14 items-center gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-left text-amber-700 ring-1 ring-amber-100 hover:bg-amber-100 xl:hidden">
            <Hourglass className="size-5 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1"><span className="block font-bold">{s.counts.pending} waiting for verification</span><span className="text-sm">Confirm who is physically here</span></span>
            <ArrowRight className="size-5 shrink-0" aria-hidden />
          </button>
        )}
        <Button variant="danger" size="lg" className="w-full" busy={busy === "close"} disabled={stale} onClick={() => act("close")}><Square className="size-4" aria-hidden />Close session</Button>
        <p className="text-center text-xs text-navy-500">Scanning only creates a request. Students count only after you confirm them.</p>
      </>}

      {status === "closed" && <FinishFlow s={s} busy={busy} stale={stale} act={act} onReview={onReview} />}
      {status === "finalized" && <Summary s={s} finalResult={finalResult} onBack={onBack} />}
    </div>
  );
}

export function StatsStrip({ c }: { c: Session["counts"] }) {
  const items = [
    { label: "Enrolled", value: c.total, icon: <Users className="size-3.5" aria-hidden /> },
    { label: "Confirmed", value: c.present + c.late, icon: <CheckCircle2 className="size-3.5" aria-hidden /> },
    { label: "Pending", value: c.pending, icon: <Hourglass className="size-3.5" aria-hidden /> },
  ];
  return (
    <div className="rounded-3xl bg-teal-50 p-4 ring-1 ring-teal-100">
      <dl className="grid grid-cols-3 gap-2">
        {items.map((i) => (
          <div key={i.label} className="min-w-0">
            <dt className="flex items-center gap-1 text-xs font-semibold text-teal-800">{i.icon}{i.label}</dt>
            <dd className="text-3xl font-extrabold tabular-nums text-navy-900">{i.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 border-t border-teal-100 pt-2 text-xs text-navy-600">
        <span className="inline-flex items-center gap-1"><XCircle className="size-3.5 text-rose-600" aria-hidden />{c.absent} absent</span>
        {c.excused > 0 && <span className="inline-flex items-center gap-1"><ShieldCheck className="size-3.5 text-teal-700" aria-hidden />{c.excused} excused</span>}
        <span className="inline-flex items-center gap-1"><Users className="size-3.5 text-navy-500" aria-hidden />{c.unmarked} not joined</span>
      </p>
    </div>
  );
}

function Step({ n, state, title, children }: { n: number; state: "done" | "current" | "todo"; title: string; children?: React.ReactNode }) {
  return (
    <li className="flex gap-3" aria-current={state === "current" ? "step" : undefined}>
      <span className={cx("grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold",
        state === "done" ? "bg-leaf-600 text-white" : state === "current" ? "bg-navy-900 text-white" : "bg-sand-100 text-navy-500 ring-1 ring-sand-300")}>
        {state === "done" ? <Check className="size-4" aria-label="Done" /> : n}
      </span>
      <div className="min-w-0 flex-1 pt-1">
        <p className={cx("font-semibold", state === "todo" && "text-navy-500")}>{title}</p>
        {children && <div className="mt-0.5 text-sm text-navy-600">{children}</div>}
      </div>
    </li>
  );
}

/** Close → resolve → finalize. One primary action at a time; finalize is disabled while anything is pending. */
function FinishFlow({ s, busy, stale, act, onReview }: { s: Session; busy: string | null; stale: boolean; act: (a: string) => Promise<boolean>; onReview: () => void }) {
  const p = s.counts.pending;
  return (
    <Card className="p-4 sm:p-5">
      <h2 className="text-lg font-bold">Finish attendance</h2>
      <ol className="mt-3 flex flex-col gap-3">
        <Step n={1} state="done" title="Session closed">New scans are no longer accepted.</Step>
        <Step n={2} state={p > 0 ? "current" : "done"} title={p > 0 ? `Resolve ${p} pending request${p === 1 ? "" : "s"}` : "Pending requests resolved"}>
          {p > 0 ? "Confirm, mark late or mark not here for each." : "Nothing left to review."}
        </Step>
        <Step n={3} state={p > 0 ? "todo" : "current"} title="Finalize">
          {s.counts.unmarked} student{s.counts.unmarked === 1 ? "" : "s"} who never joined will be recorded <b>Absent</b>. Face photos are deleted.
        </Step>
      </ol>
      <div className="mt-4 flex flex-col gap-2">
        {p > 0 && (
          <Button size="lg" className="w-full xl:hidden" onClick={onReview}><Hourglass className="size-5" aria-hidden />Review {p} pending</Button>
        )}
        <Button size="lg" variant={p > 0 ? "secondary" : "primary"} className="w-full" busy={busy === "finalize"} disabled={p > 0 || stale} onClick={() => act("finalize")}
          aria-describedby={p > 0 ? "finalize-why" : undefined}>
          <CheckCheck className="size-5" aria-hidden />Finalize attendance
        </Button>
        {p > 0 && <p id="finalize-why" className="text-center text-xs text-amber-700">Finalize unlocks once no requests are pending.</p>}
        <Button variant="ghost" className="w-full" busy={busy === "reopen"} disabled={stale} onClick={() => act("reopen")}><RotateCcw className="size-4" aria-hidden />Reopen session</Button>
      </div>
    </Card>
  );
}

function Summary({ s, finalResult, onBack }: { s: Session; finalResult: string | null; onBack: () => void }) {
  const c = s.counts;
  const rows = [
    { label: "Present", value: c.present, tone: "text-leaf-700", icon: <CheckCircle2 className="size-4" aria-hidden /> },
    { label: "Late", value: c.late, tone: "text-amber-700", icon: <Clock className="size-4" aria-hidden /> },
    { label: "Absent", value: c.absent, tone: "text-rose-700", icon: <XCircle className="size-4" aria-hidden /> },
    { label: "Excused", value: c.excused, tone: "text-teal-800", icon: <ShieldCheck className="size-4" aria-hidden /> },
  ];
  return (
    <Card className="p-4 sm:p-5">
      <Banner tone="leaf" title="Attendance finalized">{finalResult ?? `Finalized ${fmtDateTime(s.session.finalized_at)}. Records are locked.`}</Banner>
      <h2 className="mt-4 font-bold">Summary</h2>
      <dl className="mt-2 grid grid-cols-2 gap-2">
        {rows.map((r) => (
          <div key={r.label} className="rounded-2xl bg-sand-50 p-3 ring-1 ring-sand-200">
            <dt className={cx("flex items-center gap-1.5 text-sm font-semibold", r.tone)}>{r.icon}{r.label}</dt>
            <dd className="text-2xl font-extrabold tabular-nums">{r.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-sm text-navy-500">{c.present + c.late} of {c.total} attended.</p>
      <Button variant="secondary" className="mt-4 w-full" onClick={onBack}>Back to class</Button>
    </Card>
  );
}

/** Full-screen projector view of the live QR and code. */
export function Projector({ s, onClose }: { s: Session; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  if (!s.join) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label="Session QR full screen" className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 overflow-y-auto bg-white p-6">
      <button autoFocus onClick={onClose} className="absolute right-4 top-[calc(1rem+var(--safe-top))] grid size-12 place-items-center rounded-xl bg-sand-100" aria-label="Close full screen"><X className="size-6" aria-hidden /></button>
      <p className="px-12 text-center text-xl font-bold text-navy-700">{s.session.class_name}</p>
      <div className="w-full max-w-[min(72vh,90vw)]"><QR value={s.join.qrPayload} label="Attendance session QR code" /></div>
      <CodeText code={s.join.code} className="text-4xl sm:text-7xl" />
      <p className="text-center text-navy-500">Scan with InSync → Join Attendance, or type {formatCode(s.join.code)}</p>
      <p className="flex items-center gap-1.5 text-sm text-navy-500"><Clock className="size-4" aria-hidden />Code valid for <Countdown to={s.join.expiresAt} className="font-semibold" /></p>
    </div>
  );
}
