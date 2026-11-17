"use client";
import { CheckCheck, CheckCircle2, Clock, Hourglass, ScanFace, ShieldCheck, UserX, XCircle } from "lucide-react";
import { fmtTime } from "@/lib/client";
import { Button, Card, Empty, Pill } from "@/components/ui";
import { ActionButton } from "./action-button";
import { METHOD, type Mark, type Row } from "./types";

/** Verification queue. A scan never counts until the teacher confirms it here. */
export function PendingPanel({ pending, busy, mark, locked }: { pending: Row[]; busy: string | null; mark: Mark; locked: boolean }) {
  const faceOk = pending.filter((r) => r.face_check === "face_detected");
  const bulkBusy = !!busy && busy.startsWith("mark:") && busy.endsWith(":present") && busy.includes(",");
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between xl:flex-col xl:items-stretch 2xl:flex-row 2xl:items-center">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-bold"><Hourglass className="size-5 text-amber-600" aria-hidden />Pending review <span className="text-navy-500">({pending.length})</span></h2>
          <p className="text-sm text-navy-500">Confirm only students you can see in the room.</p>
        </div>
        {faceOk.length > 0 && !locked && (
          <Button className="w-full whitespace-nowrap sm:w-auto xl:w-full 2xl:w-auto" busy={bulkBusy} onClick={() => mark(faceOk.map((r) => r.student_id), "present")}>
            <CheckCheck className="size-4" aria-hidden />Accept {faceOk.length} with face detected
          </Button>
        )}
      </div>
      {pending.length === 0 ? (
        <div className="mt-4"><Empty icon={<ShieldCheck className="size-6" aria-hidden />} title="Nothing waiting">Requests appear here a few seconds after students scan.</Empty></div>
      ) : (
        <ul className="mt-4 grid gap-3 2xl:grid-cols-2">
          {pending.map((r) => (
            <li key={r.student_id} className="rise flex flex-col gap-3 rounded-2xl bg-sand-50 p-3 ring-1 ring-sand-200">
              <div className="flex items-start gap-3">
                {r.face_image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.face_image} alt={`Face check photo of ${r.name}`} className="size-16 shrink-0 rounded-xl object-cover -scale-x-100" />
                ) : <span className="grid size-16 shrink-0 place-items-center rounded-xl bg-sand-200 text-navy-500"><ScanFace className="size-6" aria-hidden /></span>}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-bold">{r.name}</p>
                  <p className="text-xs text-navy-500">{r.roll_no} · {METHOD[r.method ?? ""] ?? "—"} · {fmtTime(r.requested_at)}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <Pill tone="amber" icon={<Hourglass className="size-3" aria-hidden />}>Pending verification</Pill>
                    {r.face_check === "face_detected" ? <Pill tone="leaf" icon={<ScanFace className="size-3" aria-hidden />}>Face detected</Pill>
                      : r.face_check === "no_face" ? <Pill tone="rose" icon={<UserX className="size-3" aria-hidden />}>No face — review</Pill>
                      : <Pill tone="sand" icon={<ScanFace className="size-3" aria-hidden />}>Not checked</Pill>}
                  </div>
                </div>
              </div>
              {!locked && <>
                <ActionButton tone="mint" size="lg" className="w-full" onClick={() => mark([r.student_id], "present")} busy={busy === `mark:${r.student_id}:present`}>
                  <CheckCircle2 className="size-5" aria-hidden />Confirm present
                </ActionButton>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="secondary" onClick={() => mark([r.student_id], "late")} busy={busy === `mark:${r.student_id}:late`}><Clock className="size-4" aria-hidden />Late</Button>
                  <Button variant="secondary" onClick={() => mark([r.student_id], "absent")} busy={busy === `mark:${r.student_id}:absent`}><XCircle className="size-4" aria-hidden />Not here</Button>
                </div>
              </>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
