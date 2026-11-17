"use client";
import { useState } from "react";
import { PenLine, Search, X } from "lucide-react";
import { AttendanceStatus, Button, Card, Empty, cx, inputCls } from "@/components/ui";
import { METHOD, type Mark, type Session } from "./types";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "unmarked", label: "Not joined" },
  { id: "pending", label: "Pending" },
  { id: "present", label: "Present" },
  { id: "absent", label: "Absent" },
] as const;
type Filter = (typeof FILTERS)[number]["id"];

function matches(f: Filter, status: string | null) {
  if (f === "all") return true;
  if (f === "unmarked") return !status;
  if (f === "present") return status === "present" || status === "late";
  if (f === "absent") return status === "absent" || status === "excused";
  return status === f;
}

/** Full class list: search, filter, change a decided status, or record a manual entry with a reason. */
export function RosterPanel({ s, busy, mark }: { s: Session; busy: string | null; mark: Mark }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [manualFor, setManualFor] = useState<string | null>(null);
  const [reason, setReason] = useState("No working device");
  const needle = q.trim().toLowerCase();
  const list = s.roster.filter((r) => matches(filter, r.status) && (!needle || r.name.toLowerCase().includes(needle) || r.roll_no?.toLowerCase().includes(needle)));
  const locked = s.session.status === "finalized";
  const count = (f: Filter) => s.roster.filter((r) => matches(f, r.status)).length;

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-bold">Roster</h2>
        <p className="text-sm text-navy-500">{s.roster.length} enrolled</p>
      </div>
      <div className="relative mt-3">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-navy-500" aria-hidden />
        <input type="search" aria-label="Search roster" placeholder="Search name or roll no." className={cx(inputCls, "pl-10")} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div role="group" aria-label="Filter roster" className="-mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}
            className={cx("min-h-11 shrink-0 rounded-full px-3.5 text-sm font-semibold ring-1 transition-colors",
              filter === f.id ? "bg-navy-900 text-white ring-navy-900" : "bg-white text-navy-700 ring-sand-300 hover:bg-sand-100")}>
            {f.label} <span className={filter === f.id ? "text-white/70" : "text-navy-500"}>{count(f.id)}</span>
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="mt-3"><Empty title="No students match">Try a different name, roll number or filter.</Empty></div>
      ) : (
        <ul className="mt-2 flex flex-col divide-y divide-sand-200">
          {list.map((r) => (
            <li key={r.student_id} className="flex flex-col gap-2 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{r.name}</p>
                  <p className="text-xs text-navy-500">{r.roll_no} · Room {r.room}{r.method ? ` · ${METHOD[r.method] ?? r.method}` : ""}</p>
                  {r.manual_reason && <p className="mt-0.5 text-xs text-navy-500">Reason: {r.manual_reason}</p>}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <AttendanceStatus status={r.status} />
                  {!locked && r.status !== "pending" && (
                    r.record_id ? (
                      <select aria-label={`Change status for ${r.name}`} className="min-h-11 rounded-xl bg-white px-2 text-sm text-navy-900 ring-1 ring-sand-300"
                        value={r.status ?? ""} disabled={busy?.startsWith(`mark:${r.student_id}:`)} onChange={(e) => mark([r.student_id], e.target.value)}>
                        {["present", "late", "absent", "excused"].map((x) => <option key={x} value={x}>{x[0].toUpperCase() + x.slice(1)}</option>)}
                      </select>
                    ) : manualFor !== r.student_id ? (
                      <Button variant="ghost" className="-mr-2" onClick={() => setManualFor(r.student_id)}><PenLine className="size-4" aria-hidden />Mark manually</Button>
                    ) : null
                  )}
                </div>
              </div>
              {manualFor === r.student_id && !locked && (
                <div className="flex flex-col gap-2 rounded-2xl bg-sand-50 p-3 ring-1 ring-sand-200">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold">Manual entry for {r.name}</p>
                    <button type="button" onClick={() => setManualFor(null)} aria-label="Cancel manual entry" className="grid size-11 shrink-0 place-items-center rounded-xl text-navy-500 hover:bg-sand-100"><X className="size-4" aria-hidden /></button>
                  </div>
                  <label className="flex flex-col gap-1 text-sm font-semibold">Reason (recorded in audit log)
                    <input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
                  </label>
                  {reason.trim().length < 3 && <p className="text-xs text-amber-700">Enter at least 3 characters.</p>}
                  <div className="grid grid-cols-2 gap-2">
                    <Button busy={busy === `mark:${r.student_id}:present`} disabled={reason.trim().length < 3} onClick={async () => { if (await mark([r.student_id], "present", reason)) setManualFor(null); }}>Present</Button>
                    <Button variant="secondary" busy={busy === `mark:${r.student_id}:excused`} disabled={reason.trim().length < 3} onClick={async () => { if (await mark([r.student_id], "excused", reason)) setManualFor(null); }}>Excused</Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
