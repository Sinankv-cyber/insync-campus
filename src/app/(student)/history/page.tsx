"use client";
import { useState } from "react";
import { AlertTriangle, CalendarCheck2, ChevronDown, PackageCheck, ShieldCheck } from "lucide-react";
import { useLive } from "@/components/use-live";
import { AttendanceStatus, Empty, ErrorBanner, LastUpdated, Pill, Skeleton, cx } from "@/components/ui";
import { Disclosure, PageHeader, Panel, StudentPage } from "@/components/student/kit";
import { fmtDateTime, fmtTime, fmtWeekday } from "@/lib/client";

type History = {
  attendance: { id: string; status: string; method: string; face_check: string; manual_reason: string | null; requested_at: string; decided_at: string | null; class_name: string; subject_code: string; teacher_name: string }[];
  receipts: { id: string; storage_slot: string; deposited_at: string; deposit_method: string; returned_at: string | null; return_method: string | null; received_by_name: string; returned_by_name: string | null; phone: string }[];
  exceptions: { id: string; reason: string; starts_at: string; expires_at: string; status: string; decision_note: string | null; decided_by_name: string | null }[];
  alerts: { id: string; status: string; created_at: string; resolved_at: string | null; deadline: string }[];
};

const METHOD: Record<string, string> = { qr: "QR scan", code: "Typed code", manual: "Manual entry", finalize_default: "Not joined", id_lookup: "ID lookup" };

export default function HistoryPage() {
  const [tab, setTab] = useState<"attendance" | "custody">("attendance");
  const { data, at, stale, error, loading, reload } = useLive<History>("/api/student/history?limit=25", 30000);
  const openAlerts = data?.alerts.filter((a) => a.status === "open").length ?? 0;
  return (
    <StudentPage>
      <PageHeader crumb="History" title="History" subtitle="Confirmed results and custody receipts" />

      <div className="flex flex-col gap-2">
        <div role="tablist" aria-label="History type" className="grid grid-cols-2 gap-1 rounded-full bg-white p-1 shadow-card ring-1 ring-sand-200/70">
          {(["attendance", "custody"] as const).map((t) => (
            <button key={t} id={`tab-${t}`} role="tab" aria-selected={tab === t} aria-controls={`panel-${t}`} onClick={() => setTab(t)}
              className={cx("flex min-h-11 items-center justify-center gap-2 rounded-full text-sm font-semibold transition-colors", tab === t ? "bg-navy-950 text-white" : "text-navy-600 hover:bg-sand-100")}>
              {t === "attendance" ? <CalendarCheck2 className="size-4" aria-hidden /> : <PackageCheck className="size-4" aria-hidden />}{t === "attendance" ? "Attendance" : "Phone custody"}
            </button>
          ))}
        </div>
        <div className="flex justify-center"><LastUpdated at={at} stale={stale} /></div>
      </div>

      <ErrorBanner error={error && error.code !== "OFFLINE" ? error : null} onRetry={reload} />
      {loading && <Skeleton className="h-64" />}

      {data && tab === "attendance" && (
        <div id="panel-attendance" role="tabpanel" aria-labelledby="tab-attendance">
          {data.attendance.length ? (
            <Panel className="overflow-hidden">
              <ul className="divide-y divide-sand-200">
                {data.attendance.map((r) => (
                  <li key={r.id}>
                    <details className="group">
                      <summary className="flex min-h-16 cursor-pointer list-none flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-4 py-3 [&::-webkit-details-marker]:hidden">
                        <span className="min-w-0 flex-1">
                          <span className="block line-clamp-2 break-words font-semibold">{r.class_name}</span>
                          <span className="block text-xs text-navy-500">{fmtWeekday(r.requested_at)} · {fmtTime(r.requested_at)}</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <AttendanceStatus status={r.status} />
                          <ChevronDown className="size-4 text-navy-300 transition-transform group-open:rotate-180" aria-hidden />
                        </span>
                      </summary>
                      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 px-4 pb-4 text-sm">
                        <dt className="text-navy-500">Teacher</dt><dd className="min-w-0 break-words">{r.teacher_name}</dd>
                        <dt className="text-navy-500">Method</dt><dd className="min-w-0 break-words">{METHOD[r.method] ?? r.method}{r.manual_reason ? ` — ${r.manual_reason}` : ""}</dd>
                        {r.decided_at && <><dt className="text-navy-500">Confirmed</dt><dd>{fmtTime(r.decided_at)}</dd></>}
                      </dl>
                    </details>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : <Empty icon={<CalendarCheck2 className="size-6" aria-hidden />} title="No attendance records yet">Join a session from Today.</Empty>}
        </div>
      )}

      {data && tab === "custody" && (
        <div id="panel-custody" role="tabpanel" aria-labelledby="tab-custody" className="flex flex-col gap-4">
          {data.alerts.length > 0 && (
            <Disclosure open={openAlerts > 0 ? true : undefined} icon={<AlertTriangle className="size-4" aria-hidden />}
              title="Deadline alerts" meta={openAlerts ? `${openAlerts} open` : `${data.alerts.length} resolved`}>
              <ul className="flex flex-col divide-y divide-sand-200 text-sm">
                {data.alerts.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <span className="min-w-0">Not deposited by {fmtWeekday(a.deadline)}, {fmtTime(a.deadline)}</span>
                    {a.status === "open"
                      ? <Pill tone="rose" icon={<AlertTriangle className="size-3.5" aria-hidden />}>Open</Pill>
                      : <Pill tone="leaf" icon={<ShieldCheck className="size-3.5" aria-hidden />}>Resolved {fmtTime(a.resolved_at)}</Pill>}
                  </li>
                ))}
              </ul>
            </Disclosure>
          )}
          {data.exceptions.length > 0 && (
            <Disclosure icon={<ShieldCheck className="size-4" aria-hidden />} title="Exceptions" meta={`${data.exceptions.length} request${data.exceptions.length === 1 ? "" : "s"}`}>
              <ul className="flex flex-col gap-2">
                {data.exceptions.map((e) => (
                  <li key={e.id} className="rounded-2xl bg-sand-50 p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2"><Pill tone={e.status === "approved" ? "leaf" : e.status === "pending" ? "amber" : "rose"}>{e.status}</Pill><span className="text-navy-500">until {fmtDateTime(e.expires_at)}</span></div>
                    <p className="mt-1 break-words font-semibold">{e.reason}</p>
                    {e.decided_by_name && <p className="text-xs text-navy-500">Decided by {e.decided_by_name}{e.decision_note ? ` — ${e.decision_note}` : ""}</p>}
                  </li>
                ))}
              </ul>
            </Disclosure>
          )}

          {data.receipts.length ? (
            <section aria-labelledby="receipts-h">
              <h2 id="receipts-h" className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.14em] text-navy-500">Receipts</h2>
              <ol className="flex flex-col gap-3">
                {data.receipts.map((r) => (
                  <li key={r.id}>
                    <Panel className="p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-bold">Phone received, <span className="whitespace-nowrap">Slot {r.storage_slot}</span></p>
                        {r.returned_at ? <Pill tone="sand">Returned</Pill> : <Pill tone="leaf" icon={<ShieldCheck className="size-3.5" aria-hidden />}>In custody</Pill>}
                      </div>
                      <p className="mt-1 text-sm text-navy-600">{fmtWeekday(r.deposited_at)} · {fmtTime(r.deposited_at)} · by {r.received_by_name}</p>
                      <p className="text-xs text-navy-500">{METHOD[r.deposit_method] ?? r.deposit_method}</p>
                      {r.returned_at && <p className="mt-2 border-t border-sand-200 pt-2 text-sm text-navy-600">Returned {fmtWeekday(r.returned_at)} · {fmtTime(r.returned_at)} · by {r.returned_by_name} · {METHOD[r.return_method ?? ""] ?? r.return_method}</p>}
                    </Panel>
                  </li>
                ))}
              </ol>
            </section>
          ) : <Empty icon={<PackageCheck className="size-6" aria-hidden />} title="No custody receipts yet" />}
        </div>
      )}
    </StudentPage>
  );
}
