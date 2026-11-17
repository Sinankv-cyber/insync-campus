"use client";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { BookOpen, CheckCircle2, Hourglass, Info, ScanLine, UserRound } from "lucide-react";
import { api, fmtTime, formatCode, type ApiErr } from "@/lib/client";
import { Scanner, CodeInput } from "@/components/scanner";
import { FaceCheck, type FaceResult } from "@/components/face-check";
import { AttendanceStatus, Banner, Button, ErrorBanner, Field, cx } from "@/components/ui";
import { useMe } from "@/components/session";
import { HeroCard, Note, PageHeader, Panel, StudentPage, primaryBtn } from "@/components/student/kit";

type Preview = { className: string; subjectCode: string; teacherName: string; openedAt: string; expiresAt: string; existing: { status: string } | null };
type Step = "scan" | "code" | "preview" | "face" | "submitting" | "done";

const STEPS: { key: string; label: string }[] = [{ key: "find", label: "Find session" }, { key: "check", label: "Face check" }, { key: "wait", label: "Teacher confirms" }];

function JoinInner() {
  const params = useSearchParams();
  const router = useRouter();
  const { offline } = useMe();
  const [step, setStep] = useState<Step>("scan");
  const [code, setCode] = useState("");
  const [method, setMethod] = useState<"qr" | "code">("code");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [face, setFace] = useState<FaceResult | null>(null);
  const [err, setErr] = useState<ApiErr | null>(null);
  const [busy, setBusy] = useState(false);
  const [recordId, setRecordId] = useState<string | null>(null);
  const [finalStatus, setFinalStatus] = useState<string>("pending");

  const lookup = useCallback(async (raw: string, m: "qr" | "code") => {
    setErr(null); setBusy(true); setMethod(m);
    const r = await api<Preview>(`/api/attendance/preview?code=${encodeURIComponent(raw)}`);
    setBusy(false);
    if (!r.ok) { setErr(r.error); setStep(m === "qr" ? "scan" : "code"); return; }
    setCode(raw); setPreview(r.data); setStep("preview");
  }, []);

  useEffect(() => {
    const c = params.get("c");
    if (c) { lookup(c, "qr"); router.replace("/attendance"); } // eslint-disable-line react-hooks/set-state-in-effect
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(f: FaceResult) {
    setFace(f); setStep("submitting"); setErr(null);
    const r = await api<{ recordId: string }>("/api/attendance/join", { method: "POST", body: { code, method, ...f } });
    if (!r.ok) { setErr(r.error); setStep(r.error.code === "ALREADY_JOINED" ? "done" : "preview"); if (r.error.code === "ALREADY_JOINED") setFinalStatus(String(r.error.status ?? "pending")); return; }
    setRecordId(r.data.recordId); setStep("done");
  }

  // After submitting, poll until the teacher confirms.
  useEffect(() => {
    if (step !== "done" || finalStatus !== "pending") return;
    const t = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      const r = await api<{ attendance: { id: string; status: string }[] }>("/api/student/history?limit=5");
      if (r.ok) {
        const rec = recordId ? r.data.attendance.find((a) => a.id === recordId) : r.data.attendance[0];
        if (rec && rec.status !== "pending") setFinalStatus(rec.status);
      }
    }, 5000);
    return () => clearInterval(t);
  }, [step, recordId, finalStatus]);

  const stepIdx = step === "scan" || step === "code" || step === "preview" ? 0 : step === "done" ? 2 : 1;
  const title = step === "done" ? (finalStatus === "pending" ? "Request sent" : "All done") : step === "code" ? "Enter class code" : step === "scan" ? "Join attendance" : "Confirm session";

  return (
    <StudentPage>
      <PageHeader crumb="Attendance" back={{ href: "/today", label: "Back to Today" }} title={title}
        subtitle={<span className="ml text-xs">ക്ലാസിലെ QR സ്കാൻ ചെയ്യൂ</span>} />

      {/* Step indicator */}
      <ol aria-label="Steps" className="-mt-1 grid grid-cols-3 gap-2">
        {STEPS.map((s, i) => (
          <li key={s.key} aria-current={i === stepIdx ? "step" : undefined} className="min-w-0">
            <span className={cx("block h-1.5 rounded-full", i < stepIdx ? "bg-teal-600" : i === stepIdx ? "bg-navy-950" : "bg-sand-200")} />
            <span className={cx("mt-1.5 block truncate text-[11px] font-semibold", i === stepIdx ? "text-navy-900" : "text-navy-500")}>{s.label}</span>
          </li>
        ))}
      </ol>

      {offline && step !== "done" && <Banner tone="amber" title="You're offline">Joining needs a connection. Reconnect, or ask your teacher to mark you manually.</Banner>}
      <ErrorBanner error={err && step !== "done" ? err : null} />

      {step === "scan" && (
        <>
          <Panel className="p-4 sm:p-5">
            <Scanner onResult={(t) => lookup(t, "qr")} onUseCode={() => { setErr(null); setStep("code"); }} />
            {busy && <p className="mt-3 text-center text-sm text-navy-500" role="status">Checking code…</p>}
          </Panel>
          <Note className="flex gap-2.5"><Info className="mt-0.5 size-4 shrink-0 text-teal-700" aria-hidden /><span>Joining sends a request. You&apos;re marked present only after your teacher confirms you in class.</span></Note>
        </>
      )}

      {step === "code" && (
        <Panel className="p-5">
          <form onSubmit={(e) => { e.preventDefault(); lookup(code, "code"); }} className="flex flex-col gap-4">
            <Field id="join-code" label="8-character session code" hint={<span id="join-code-hint">Shown under the QR on your teacher&apos;s screen. Letters O, I, L and digits 0, 1 are never used.</span>}>
              <CodeInput id="join-code" value={code} onChange={setCode} autoFocus />
            </Field>
            <Button type="submit" size="lg" busy={busy} disabled={code.replace("-", "").length !== 8 || offline}>Continue</Button>
            <Button type="button" variant="ghost" onClick={() => { setErr(null); setStep("scan"); }}><ScanLine className="size-4" aria-hidden />Scan QR instead</Button>
          </form>
        </Panel>
      )}

      {(step === "preview" || step === "face" || step === "submitting") && preview && (
        <>
          <HeroCard>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/60">Session found · {method === "qr" ? "via QR" : "via code"}</p>
            <h2 className="mt-2 break-words text-2xl font-extrabold leading-tight">{preview.className}</h2>
            <p className="mt-2 flex items-center gap-2 text-sm text-white/75"><UserRound className="size-4 shrink-0" aria-hidden /><span className="min-w-0">{preview.teacherName} · opened {fmtTime(preview.openedAt)}</span></p>
            <p className="mt-1 text-xs text-white/55">Code <span className="code-chars">{formatCode(code.replace(/[^A-Z0-9]/gi, "").slice(-8).toUpperCase())}</span></p>
            {preview.existing ? (
              <div className="mt-5 rounded-2xl bg-white p-4 text-navy-900">
                <p className="font-semibold">You already joined this session</p>
                <p className="mt-2 inline-flex flex-wrap items-center gap-2 text-sm">Current status: <AttendanceStatus status={preview.existing.status} /></p>
              </div>
            ) : step === "preview" ? (
              <>
                <p className="mt-4 text-sm text-white/80">Next: a quick face check, then your request goes to {preview.teacherName.split(" ").slice(-1)[0]} for confirmation.</p>
                <button type="button" onClick={() => setStep("face")} disabled={offline} className={cx(primaryBtn, "mt-4 bg-teal-500 text-navy-950 hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-50")}>Continue</button>
              </>
            ) : null}
          </HeroCard>
          {step === "face" && <Panel className="rise p-4 sm:p-5"><FaceCheck onDone={submit} /></Panel>}
          {step === "submitting" && <Panel className="p-5"><p className="flex items-center gap-2 text-navy-600" role="status"><Hourglass className="size-4 animate-pulse" aria-hidden />Saving your request…</p></Panel>}
        </>
      )}

      {step === "done" && (
        <>
          <Panel className="rise rounded-[28px] p-6 text-center">
            {finalStatus === "pending" ? (
              <>
                <span className="pulse-ring mx-auto grid size-16 place-items-center rounded-full bg-amber-50 text-amber-700"><Hourglass className="size-8" aria-hidden /></span>
                <h2 className="mt-4 text-2xl font-extrabold">Awaiting teacher confirmation</h2>
                <div className="mt-3 flex justify-center"><AttendanceStatus status="pending" /></div>
                <p className="mt-3 text-sm text-navy-600">You are not marked present until your teacher confirms you in class.</p>
                <p className="ml mt-1 text-xs text-navy-500">ടീച്ചർ സ്ഥിരീകരിക്കുന്നതുവരെ കാത്തിരിക്കൂ.</p>
                <p className="mt-3 text-xs text-navy-500" role="status" aria-live="polite">This page updates automatically.</p>
              </>
            ) : (
              <>
                <span className="mx-auto grid size-16 place-items-center rounded-full bg-leaf-50 text-leaf-700"><CheckCircle2 className="size-8" aria-hidden /></span>
                <h2 className="mt-4 text-2xl font-extrabold">Teacher confirmed</h2>
                <div className="mt-3 flex justify-center" role="status"><AttendanceStatus status={finalStatus} /></div>
              </>
            )}
            {face && (
              <p className="mx-auto mt-4 w-fit max-w-full rounded-full bg-sand-100 px-3 py-1 text-xs text-navy-600">
                Face check: {face.faceCheck === "face_detected" ? "face detected" : face.faceCheck === "no_face" ? "no face found (teacher will review)" : "not checked (teacher will review)"}
              </p>
            )}
            <div className="mt-6 flex flex-col gap-2">
              <Link href="/today" className={cx(primaryBtn, "bg-teal-700 text-white hover:bg-teal-800")}>Back to Today</Link>
              <Link href="/history" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl font-semibold text-navy-700 hover:bg-sand-100"><BookOpen className="size-4" aria-hidden />View history</Link>
            </div>
          </Panel>
        </>
      )}
    </StudentPage>
  );
}

export default function AttendancePage() {
  return <Suspense fallback={null}><JoinInner /></Suspense>;
}
