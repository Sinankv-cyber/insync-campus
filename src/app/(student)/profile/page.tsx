"use client";
import { useState } from "react";
import { BookOpen, CheckCircle2, Download, Hourglass, LogOut, Mail, ShieldPlus, Smartphone, XCircle } from "lucide-react";
import { api, fmtDateTime, logout, type ApiErr } from "@/lib/client";
import { useMe } from "@/components/session";
import { useLive } from "@/components/use-live";
import { InstallGuide, NotificationSettings } from "@/components/install";
import { EnrollCard } from "@/components/enroll";
import { Banner, Button, CustodyPill, ErrorBanner, Field, Pill, inputCls } from "@/components/ui";
import { Disclosure, HeroCard, PageHeader, Panel, StudentPage } from "@/components/student/kit";
import type { TodayData } from "../today/page";

export default function ProfilePage() {
  const { me } = useMe();
  const u = me!.user!;
  const { data } = useLive<TodayData>("/api/student/today", 60000);
  const c = data?.custody;
  const [reason, setReason] = useState("");
  const [until, setUntil] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ApiErr | null>(null);
  const [ok, setOk] = useState(false);

  async function requestException(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null); setOk(false);
    const r = await api("/api/exceptions", { method: "POST", body: { reason, expiresAt: new Date(until).toISOString() } });
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setOk(true); setReason(""); setUntil("");
  }

  const reasonShort = reason.trim().length < 5;
  const enrollments = me?.enrollments ?? [];

  return (
    <StudentPage>
      <PageHeader crumb="Profile" title="Profile" />

      {/* Identity */}
      <HeroCard>
        <div className="flex items-center gap-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-teal-500 text-xl font-extrabold text-navy-950" aria-hidden>{u.name.split(" ").map((x) => x[0]).slice(0, 2).join("")}</span>
          <div className="min-w-0">
            <p className="break-words text-xl font-extrabold leading-tight">{u.name}</p>
            <p className="mt-0.5 text-sm text-white/75">{u.roll_no ?? "No roll number yet"} · {u.room ? `Room ${u.room}` : "No room"}</p>
            <p className="flex min-w-0 items-center gap-1.5 text-sm text-white/60"><Mail className="size-3.5 shrink-0" aria-hidden /><span className="truncate">{u.email}</span></p>
          </div>
        </div>
      </HeroCard>

      {/* Phone */}
      <Panel className="p-4 sm:p-5" aria-labelledby="phone-h">
        <h2 id="phone-h" className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-navy-500"><Smartphone className="size-4 text-teal-600" aria-hidden />Registered phone</h2>
        {c?.phone ? (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0"><p className="break-words font-semibold">{c.phone.description}</p><p className="text-sm text-navy-500">Storage slot {c.phone.storage_slot}</p></div>
            <CustodyPill status={c.status} />
          </div>
        ) : <p className="mt-2 text-sm text-navy-500">No phone registered. The warden or college office registers phones.</p>}
        {c?.exception && <div className="mt-3"><Banner tone={c.exception.status === "approved" ? "teal" : "amber"} title={c.exception.status === "approved" ? "Current exception" : "Exception requested"}>{c.exception.reason} · until {fmtDateTime(c.exception.expires_at)}</Banner></div>}
      </Panel>

      {/* Classes */}
      <Panel className="p-4 sm:p-5" aria-labelledby="classes-h">
        <h2 id="classes-h" className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-navy-500"><BookOpen className="size-4 text-teal-600" aria-hidden />My classes</h2>
        <ul className="mt-1 flex flex-col divide-y divide-sand-200">
          {enrollments.map((e) => (
            <li key={e.id} className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1 py-1.5 text-sm"><span className="min-w-0 break-words font-semibold">{e.name}</span><EnrollStatus status={e.status} /></li>
          ))}
          {!enrollments.length && <li className="py-1 text-sm text-navy-500">Not in any class yet.</li>}
        </ul>
      </Panel>
      {!enrollments.some((e) => e.status === "approved") ? null : (
        <Disclosure icon={<BookOpen className="size-4" aria-hidden />} title="Join another class">
          <div className="-mx-2 sm:mx-0"><EnrollCard pending={[]} /></div>
        </Disclosure>
      )}

      {/* Exception request (collapsed) */}
      <Disclosure icon={<ShieldPlus className="size-4" aria-hidden />} title="Request a time-limited exception" meta="Medical, family or event · warden decides">
        <p className="text-sm text-navy-500">For a real need. The warden approves or declines; everything is recorded.</p>
        <form onSubmit={requestException} className="mt-4 flex flex-col gap-4">
          <Field id="ex-reason" label="Reason" hint={`${reasonShort ? "At least 5 characters. " : ""}${300 - reason.length} characters left.`}>
            <textarea id="ex-reason" className={`${inputCls} min-h-24 resize-y py-2.5`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} required minLength={5} />
          </Field>
          <Field id="ex-until" label="Needed until" hint="Date and time in your local time zone.">
            <input id="ex-until" type="datetime-local" className={inputCls} value={until} onChange={(e) => setUntil(e.target.value)} required />
          </Field>
          <ErrorBanner error={err} />
          {ok && <Banner tone="leaf" title="Request sent">The warden will review it. You&apos;ll see the decision here and in notifications.</Banner>}
          <Button type="submit" size="lg" busy={busy} disabled={reasonShort || !until}>Send request</Button>
        </form>
      </Disclosure>

      <NotificationSettings />

      <Disclosure icon={<Download className="size-4" aria-hidden />} title="Add to home screen" meta="Install InSync on this device">
        <div className="-mx-2 sm:mx-0"><InstallGuide /></div>
      </Disclosure>

      <div className="flex flex-col gap-2 pt-1">
        <Button variant="secondary" size="lg" onClick={logout}><LogOut className="size-4" aria-hidden />Sign out</Button>
        <p className="text-center text-xs text-navy-500">Signing out clears InSync data saved on this device. InSync cannot see or control your phone.</p>
      </div>
    </StudentPage>
  );
}

function EnrollStatus({ status }: { status: string }) {
  if (status === "approved") return <Pill tone="leaf" icon={<CheckCircle2 className="size-3.5" aria-hidden />}>Approved</Pill>;
  if (status === "pending") return <Pill tone="amber" icon={<Hourglass className="size-3.5" aria-hidden />}>Awaiting teacher</Pill>;
  return <Pill tone="rose" icon={<XCircle className="size-3.5" aria-hidden />}>{status.charAt(0).toUpperCase() + status.slice(1)}</Pill>;
}
