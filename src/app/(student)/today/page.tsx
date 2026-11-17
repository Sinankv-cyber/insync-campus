"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, Bell, BookOpen, CalendarCheck2, ChevronRight, Clock3, QrCode, ShieldCheck, Smartphone } from "lucide-react";
import { useMe } from "@/components/session";
import { useLive } from "@/components/use-live";
import { AttendanceStatus, Banner, Countdown, CustodyPill, Empty, ErrorBanner, LastUpdated, Pill, Skeleton, cx } from "@/components/ui";
import { InstallGuide } from "@/components/install";
import { EnrollCard } from "@/components/enroll";
import { Disclosure, HeroCard, LiveChip, PageHeader, Panel, Progress, StudentPage, primaryBtn } from "@/components/student/kit";
import { fmtDateTime, fmtTime, hhmmLabel, relTime } from "@/lib/client";

export type TodayData = {
  serverTime: string;
  cycle: { id: string; isDemo: boolean; useStart: string; useEnd: string; graceMinutes: number; windowStart: string; windowEnd: string; deadline: string };
  custody: {
    status: "in_custody" | "with_student" | "overdue" | "exempt" | "no_phone";
    phone: { description: string; storage_slot: string } | null;
    activeReceipt: { deposited_at: string; storage_slot: string; received_by_name: string; deposit_method: string } | null;
    exception: { reason: string; expires_at: string; status: string } | null;
    openAlert: { created_at: string } | null;
  };
  recentAttendance: { id: string; status: string; class_name: string; subject_code: string; requested_at: string; decided_at: string | null }[];
  notifications: { id: string; title: string; body: string; created_at: string; kind: string }[];
};

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", hour12: false }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function todayLabel() {
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" }).format(new Date()).toUpperCase();
}

export default function TodayPage() {
  const { me } = useMe();
  const { data, at, stale, error, loading, reload } = useLive<TodayData>("/api/student/today", 15000);
  const [showInstall, setShowInstall] = useState(false);
  const [updatesOpen, setUpdatesOpen] = useState(false);
  useEffect(() => {
    try {
      const just = sessionStorage.getItem("hp:justSignedIn");
      const dismissed = localStorage.getItem("hp:installDismissed");
      if (just || !dismissed) setShowInstall(true); // eslint-disable-line react-hooks/set-state-in-effect
      sessionStorage.removeItem("hp:justSignedIn");
    } catch {}
  }, []);

  const u = me!.user!;
  const approved = (me?.enrollments ?? []).filter((e) => e.status === "approved");
  const pendingEnroll = (me?.enrollments ?? []).filter((e) => e.status === "pending");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  const deadline = data ? new Date(data.cycle.deadline).getTime() : 0;
  const windowStart = data ? new Date(data.cycle.windowStart).getTime() : 0;
  const mins = (deadline - now) / 60000;
  const c = data?.custody;
  const soon = c?.status === "with_student" && mins > 0 && mins <= 30;
  const span = Math.max(1, deadline - windowStart);
  const leftPct = now < windowStart ? 100 : ((deadline - now) / span) * 100;
  const heroTone = c?.status === "overdue" ? "rose" : soon ? "amber" : c?.status === "in_custody" ? "leaf" : "teal";
  const notes = data?.notifications ?? [];

  function openUpdates() {
    setUpdatesOpen(true);
    requestAnimationFrame(() => document.getElementById("updates")?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }));
  }

  const subtitle = [u.roll_no ?? "Roll no. pending", u.room ? `Room ${u.room}` : "Room not assigned", u.hostel_name ? `${u.hostel_name.split(" ")[0]} Hostel` : null].filter(Boolean).join(" · ");

  return (
    <StudentPage>
      <PageHeader
        crumb="Today"
        title={<>{greeting()}, {u.name.split(" ")[0]}.</>}
        subtitle={subtitle}
        right={
          <div className="flex items-center gap-1">
            <LiveChip at={at} stale={stale} />
            <button type="button" onClick={openUpdates} aria-label={`Updates${notes.length ? `, ${notes.length}` : ""}`} className="relative grid size-11 place-items-center rounded-full text-navy-900 hover:bg-sand-100">
              <Bell className="size-5" aria-hidden />
              {notes.some((n) => n.kind === "overdue") && <span aria-hidden className="absolute right-2.5 top-2.5 size-2 rounded-full bg-rose-600 ring-2 ring-sand-50" />}
            </button>
          </div>
        }
      />

      <ErrorBanner error={error && error.code !== "OFFLINE" ? error : null} onRetry={reload} />
      {stale && <Banner tone="amber" title="Offline — last known status">This is what InSync knew {at ? relTime(at) : ""}. It may have changed. Passes can&apos;t be issued while offline.</Banner>}

      {/* Hero: phone custody status + the one primary action */}
      <HeroCard tone={heroTone}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/60">Phone custody · {todayLabel()}</p>
          {c && <CustodyPill status={c.status} />}
        </div>

        {loading ? (
          <div aria-hidden>
            <Skeleton className="mt-4 h-8 w-3/4 bg-white/10" />
            <Skeleton className="mt-3 h-14 w-1/2 bg-white/10" />
            <Skeleton className="mt-5 h-13 bg-white/10" />
          </div>
        ) : !data || !c ? (
          <p className="mt-3 text-sm text-white/75">Status unavailable right now. The warden can still find you by roll number.</p>
        ) : (
          <>
            {c.status === "with_student" && <>
              <h2 className="mt-3 text-2xl font-extrabold leading-tight">Hand your phone to the warden by {fmtTime(data.cycle.deadline)}</h2>
              {mins > 0 ? (
                <p className={cx("mt-3 text-5xl font-extrabold tracking-tight sm:text-6xl", soon ? "text-amber-100" : "text-teal-100")}>
                  <Countdown to={data.cycle.deadline} onExpire={reload} /> <span className="text-base font-semibold text-white/70">left</span>
                </p>
              ) : <p className="mt-3 text-xl font-bold">Deadline passed</p>}
              <div className="mt-4"><Progress dark pct={leftPct} warn={soon} label="Time left before deposit deadline" /></div>
              <p className="mt-2 flex flex-wrap gap-x-2 text-xs text-white/65">
                <span>{data.cycle.isDemo ? `Demo cycle · ends ${fmtTime(data.cycle.windowEnd)}` : `Phone use ${hhmmLabel(data.cycle.useStart)} – ${hhmmLabel(data.cycle.useEnd)}`}</span>
                <span>· {data.cycle.graceMinutes} min grace</span>
              </p>
              {c.phone && <p className="mt-1 text-xs text-white/65">{c.phone.description} · Slot {c.phone.storage_slot}</p>}
            </>}

            {c.status === "overdue" && <>
              <h2 className="mt-3 flex items-start gap-2 text-2xl font-extrabold leading-tight"><AlertTriangle className="mt-1 size-6 shrink-0 text-rose-50" aria-hidden />Phone not deposited by the deadline</h2>
              <p className="mt-2 text-sm text-white/80">Deposit was due at {fmtTime(data.cycle.deadline)}. Go to the warden now — the alert clears when they confirm receipt.</p>
            </>}

            {c.status === "in_custody" && <>
              <h2 className="mt-3 flex items-start gap-2 text-2xl font-extrabold leading-tight"><ShieldCheck className="mt-1 size-6 shrink-0 text-leaf-50" aria-hidden /><span>Phone received, <span className="whitespace-nowrap">Slot {c.activeReceipt?.storage_slot}</span></span></h2>
              {c.activeReceipt && <p className="mt-2 text-sm text-white/75">Confirmed by {c.activeReceipt.received_by_name} · {fmtDateTime(c.activeReceipt.deposited_at)}</p>}
              <p className="mt-1 text-xs text-white/60">Done for today. To collect, show the pass or your ID card at the desk.</p>
            </>}

            {c.status === "exempt" && <>
              <h2 className="mt-3 text-2xl font-extrabold leading-tight">Exception until {fmtDateTime(c.exception?.expires_at)}</h2>
              {c.exception && <p className="mt-2 text-sm text-white/75">{c.exception.reason}</p>}
            </>}

            {c.status === "no_phone" && <>
              <h2 className="mt-3 flex items-start gap-2 text-2xl font-extrabold leading-tight"><Smartphone className="mt-1 size-6 shrink-0" aria-hidden />No registered phone</h2>
              <p className="mt-2 text-sm text-white/75">Ask the warden or college office to register your phone and storage slot.</p>
            </>}

            {c.exception?.status === "pending" && <p className="mt-3"><Pill tone="amber">Exception request pending</Pill></p>}

            {c.status === "in_custody" ? (
              <Link href="/pass?purpose=collect" className={cx(primaryBtn, "mt-5 bg-teal-500 text-navy-950 hover:bg-teal-100")}>
                <QrCode className="size-5" aria-hidden />Show Collect Pass
              </Link>
            ) : c.status !== "no_phone" && (
              <Link href="/pass?purpose=deposit" className={cx(primaryBtn, "mt-5", c.status === "overdue" ? "bg-rose-600 text-white hover:bg-rose-700" : c.status === "exempt" ? "bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/15" : "bg-teal-500 text-navy-950 hover:bg-teal-100")}>
                <QrCode className="size-5" aria-hidden />Show Deposit Pass
              </Link>
            )}
            <p className="mt-3 text-center text-[11px] text-white/50">Campus deposit timer · InSync can&apos;t see or control your phone</p>
          </>
        )}
      </HeroCard>

      {/* Attendance */}
      <Panel aria-labelledby="att-h" className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 id="att-h" className="text-lg font-bold">Attendance</h2>
          <Link href="/history" className="-mr-2 inline-flex min-h-11 items-center gap-0.5 rounded-xl px-2 text-sm font-semibold text-teal-700 hover:bg-teal-50">History<ChevronRight className="size-4" aria-hidden /></Link>
        </div>
        <Link href="/attendance" className="group mt-2 flex min-h-16 items-center gap-3 rounded-2xl bg-teal-50 p-3 ring-1 ring-teal-100 hover:bg-teal-100">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-teal-700 text-white"><CalendarCheck2 className="size-5" aria-hidden /></span>
          <span className="min-w-0 flex-1"><span className="block font-bold text-navy-900">Join Attendance</span><span className="block text-sm text-navy-600">Scan the class QR or type the code</span></span>
          <ArrowRight className="size-5 shrink-0 text-teal-700 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </Link>
        {loading ? <Skeleton className="mt-3 h-16" /> : data?.recentAttendance.length ? (
          <ul className="mt-2 flex flex-col divide-y divide-sand-200">
            {data.recentAttendance.slice(0, 3).map((r) => (
              <li key={r.id} className="flex min-h-14 flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
                <div className="min-w-0 flex-1"><p className="truncate font-semibold">{r.class_name}</p><p className="text-xs text-navy-500">{fmtDateTime(r.requested_at)}</p></div>
                <AttendanceStatus status={r.status} />
              </li>
            ))}
          </ul>
        ) : data ? <div className="mt-3"><Empty icon={<BookOpen className="size-6" aria-hidden />} title="No attendance yet">Join your first session with the class QR or code.</Empty></div> : null}
      </Panel>

      {approved.length === 0 && <EnrollCard pending={pendingEnroll} />}
      {pendingEnroll.length > 0 && approved.length > 0 && <Banner tone="amber" title="Class request pending">{pendingEnroll.map((e) => e.name).join(", ")} — waiting for your teacher to approve.</Banner>}

      {/* Updates (collapsed) */}
      <Disclosure id="updates" open={updatesOpen} onToggle={setUpdatesOpen} className="scroll-mt-4"
        icon={<Bell className="size-4" aria-hidden />}
        title={<>Updates{notes.length ? <span className="ml-1.5 text-sm font-semibold text-navy-500">{notes.length > 5 ? "5+" : notes.length}</span> : null}</>}
        meta={loading ? "Loading…" : notes[0] ? notes[0].title : "Receipts and alerts appear here"}>
        {loading ? <Skeleton className="h-20" /> : notes.length ? (
          <ul className="flex flex-col divide-y divide-sand-200">
            {notes.slice(0, 5).map((n) => (
              <li key={n.id} className="py-2.5">
                <p className={cx("flex items-center gap-1.5 font-semibold", n.kind === "overdue" && "text-rose-700")}>{n.kind === "overdue" && <AlertTriangle className="size-4 shrink-0" aria-hidden />}{n.title}</p>
                <p className="text-sm text-navy-600">{n.body}</p>
                <p className="mt-0.5 flex items-center gap-1 text-xs text-navy-500"><Clock3 className="size-3" aria-hidden />{relTime(n.created_at)}</p>
              </li>
            ))}
          </ul>
        ) : <Empty title="All quiet">Receipts and alerts will appear here.</Empty>}
      </Disclosure>

      {showInstall && <InstallGuide compact onDismiss={() => { setShowInstall(false); try { localStorage.setItem("hp:installDismissed", "1"); } catch {} }} />}

      <div className="flex justify-center"><LastUpdated at={at} stale={stale} /></div>
    </StudentPage>
  );
}
