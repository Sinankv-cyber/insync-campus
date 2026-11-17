"use client";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Clock, CloudOff, Hourglass, RefreshCw, Sun, XCircle } from "lucide-react";
import { api, fmtDateTime, type ApiErr } from "@/lib/client";
import { Banner, Button, CodeText, Countdown, ErrorBanner, QR, Skeleton, cx } from "@/components/ui";
import { useMe } from "@/components/session";
import { HeroCard, Note, PageHeader, Panel, Progress, StudentPage, primaryBtn } from "@/components/student/kit";

type Pass = { id: string; code: string; expiresAt: string; purpose: "deposit" | "collect"; ttlSec: number; qrPayload: string };
type PassStatus = { state: "waiting" | "confirmed" | "expired" | "revoked"; receipt: { storage_slot: string; deposited_at: string; returned_at: string | null; received_by_name: string; returned_by_name: string | null; phone: string; deposit_method: string; return_method: string | null } | null };

function PassInner() {
  const params = useSearchParams();
  const purpose = params.get("purpose") === "collect" ? "collect" : "deposit";
  const { me, offline } = useMe();
  const u = me!.user!;
  const [pass, setPass] = useState<Pass | null>(null);
  const [status, setStatus] = useState<PassStatus["state"]>("waiting");
  const [receipt, setReceipt] = useState<PassStatus["receipt"]>(null);
  const [err, setErr] = useState<ApiErr | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const issue = useCallback(async () => {
    setBusy(true); setErr(null); setStatus("waiting");
    const r = await api<Pass>("/api/student/pass", { method: "POST", body: { purpose } });
    setBusy(false);
    if (!r.ok) {
      setPass(null);
      if (r.error.code === "ALREADY_RECEIVED" && purpose === "deposit") {
        // Show the existing receipt instead of a bare error.
        const t = await api<{ custody: { activeReceipt: { deposited_at: string; storage_slot: string; received_by_name: string; deposit_method: string } | null; phone: { description: string } | null } }>("/api/student/today");
        const a = t.ok ? t.data.custody.activeReceipt : null;
        if (a) { setReceipt({ storage_slot: a.storage_slot, deposited_at: a.deposited_at, returned_at: null, received_by_name: a.received_by_name, returned_by_name: null, phone: t.ok ? t.data.custody.phone?.description ?? "" : "", deposit_method: a.deposit_method, return_method: null }); setStatus("confirmed"); return; }
      }
      setErr(r.error); return;
    }
    setPass(r.data);
  }, [purpose]);

  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { if (!offline) issue(); }, []);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  // Poll for staff confirmation. A scan alone never changes this — only the warden's confirm.
  useEffect(() => {
    if (!pass || status !== "waiting") return;
    const t = setInterval(async () => {
      const r = await api<PassStatus>(`/api/student/pass?id=${pass.id}`);
      if (r.ok) { setStatus(r.data.state); if (r.data.receipt) setReceipt(r.data.receipt); }
    }, 2500);
    return () => clearInterval(t);
  }, [pass, status]);

  const remaining = pass ? Math.max(0, new Date(pass.expiresAt).getTime() - now) : 0;
  const pct = pass ? Math.max(0, Math.min(100, (remaining / (pass.ttlSec * 1000)) * 100)) : 0;
  const expired = pass && (remaining <= 0 || status === "expired" || status === "revoked");
  const confirmed = status === "confirmed" && receipt;
  const isDeposit = purpose === "deposit";

  return (
    <StudentPage>
      <PageHeader
        crumb={isDeposit ? "Deposit pass" : "Collect pass"}
        back={{ href: "/today", label: "Back to Today" }}
        title={confirmed ? (isDeposit ? "Receipt" : "Returned") : isDeposit ? "Your deposit pass" : "Your collect pass"}
        subtitle={confirmed ? "Confirmed by the warden." : "Single use · show it to the hostel warden."}
      />

      {offline && !pass && <Banner tone="amber" title="Offline — no pass issued" icon={<CloudOff className="size-5" aria-hidden />}>Passes are issued by the server and can&apos;t be created offline. The warden can find you by roll number ({u.roll_no}) instead.</Banner>}
      <ErrorBanner error={err} onRetry={err?.code === "OFFLINE" ? issue : undefined} />

      {confirmed ? (
        <>
          <HeroCard tone="leaf">
            <div className="flex flex-col items-center text-center">
              <span className="grid size-16 place-items-center rounded-full bg-leaf-600 text-white"><CheckCircle2 className="size-9" aria-hidden /></span>
              <h2 className="mt-4 text-2xl font-extrabold leading-tight">{isDeposit ? <>Phone received, <span className="whitespace-nowrap">Slot {receipt.storage_slot}</span></> : "Phone returned to you"}</h2>
              <p className="mt-1 text-sm text-white/75">Confirmed by {isDeposit ? receipt.received_by_name : receipt.returned_by_name}</p>
            </div>
            <dl className="mt-5 grid grid-cols-1 gap-3 rounded-2xl bg-white/8 p-4 text-sm ring-1 ring-white/10 min-[380px]:grid-cols-2">
              <div className="min-w-0"><dt className="text-white/60">Student</dt><dd className="break-words font-semibold">{u.name} — {u.roll_no}</dd></div>
              <div className="min-w-0"><dt className="text-white/60">Phone</dt><dd className="break-words font-semibold">{receipt.phone || "—"}</dd></div>
              <div><dt className="text-white/60">{isDeposit ? "Received at" : "Returned at"}</dt><dd className="font-semibold">{fmtDateTime(isDeposit ? receipt.deposited_at : receipt.returned_at)}</dd></div>
              <div><dt className="text-white/60">Method</dt><dd className="font-semibold uppercase">{isDeposit ? receipt.deposit_method : receipt.return_method}</dd></div>
            </dl>
            <Link href="/today" className={cx(primaryBtn, "mt-5 bg-teal-500 text-navy-950 hover:bg-teal-100")}>Back to Today</Link>
          </HeroCard>
          <Note>This receipt records the warden&apos;s confirmation at that time. It is not continuous tracking of the phone&apos;s location.</Note>
        </>
      ) : pass ? (
        <>
          <Panel className="rise rounded-[28px] p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              {expired ? (
                <p className="inline-flex items-center gap-1.5 text-sm font-bold text-rose-700"><XCircle className="size-4" aria-hidden />Pass expired</p>
              ) : (
                <p className="inline-flex items-center gap-1.5 text-sm font-bold text-amber-700" role="status">
                  <span aria-hidden className="size-2 rounded-full bg-amber-600" /><Hourglass className="size-3.5" aria-hidden />Awaiting warden
                </p>
              )}
              <p className="inline-flex items-center gap-1 text-xs font-semibold text-navy-500"><Sun className="size-3.5 text-amber-600" aria-hidden />Brightness up</p>
            </div>

            <div className={cx("relative mx-auto mt-4 w-full max-w-[300px] transition-opacity", expired && "opacity-15")}>
              <QR value={pass.qrPayload} label={`${purpose} pass QR code`} />
            </div>
            {expired && <p className="sr-only">This QR code has expired.</p>}

            <div className="mt-4 text-center">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-navy-500">Or read out this code</p>
              <CodeText code={pass.code} className={cx("mt-1 block text-[34px] leading-tight text-navy-950", expired && "line-through opacity-40")} />
            </div>

            <div className="mx-auto mt-4 w-full max-w-[300px]">
              <Progress pct={pct} warn={pct < 25} label="Time left on pass" />
              <p className="mt-2 flex items-center justify-center gap-1.5 text-sm text-navy-600"><Clock className="size-4" aria-hidden />{expired ? "Pass expired" : <>Expires in <Countdown to={pass.expiresAt} className="font-semibold" /> · single use</>}</p>
            </div>

            <div className="mt-4 border-t border-sand-200 pt-4 text-center">
              <p className="break-words font-semibold text-navy-900">{u.name} · {u.roll_no}</p>
              <p className="text-sm text-navy-500">Room {u.room ?? "—"}</p>
            </div>

            {expired && <Button className="mt-4 w-full" size="lg" onClick={issue} busy={busy} disabled={offline}><RefreshCw className="size-4" aria-hidden />Get a fresh pass</Button>}
          </Panel>

          <Note>
            <p>{isDeposit ? "Show this when handing over your phone." : "Show this at the warden desk to collect your phone."} {isDeposit ? "It is not recorded as received until the warden confirms." : "It is not recorded as returned until the warden confirms."}</p>
            <p className="ml mt-1 text-xs text-navy-500">{isDeposit ? "ഫോൺ കൊടുക്കുമ്പോൾ ഇത് കാണിക്കുക." : "ഫോൺ തിരികെ വാങ്ങുമ്പോൾ ഇത് കാണിക്കുക."}</p>
          </Note>
        </>
      ) : busy ? (
        <Panel className="flex flex-col items-center gap-4 rounded-[28px] p-6">
          <Skeleton className="aspect-square w-full max-w-[260px]" />
          <p className="text-sm text-navy-500" role="status">Issuing a secure pass…</p>
        </Panel>
      ) : null}

      <p className="px-1 text-center text-xs text-navy-500">No phone or pass? The warden can look you up by roll number or ID card.</p>
    </StudentPage>
  );
}

export default function PassPage() {
  return <Suspense fallback={null}><PassInner /></Suspense>;
}
