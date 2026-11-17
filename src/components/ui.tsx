"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import {
  AlertTriangle, CheckCircle2, Clock, CloudOff, Info, Loader2, ShieldCheck, XCircle, Hourglass, Smartphone, Ban,
} from "lucide-react";
import { formatCode, relTime } from "@/lib/client";

export function cx(...c: (string | false | null | undefined)[]) { return c.filter(Boolean).join(" "); }

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" | "amber"; size?: "md" | "lg"; busy?: boolean };
export function Button({ variant = "primary", size = "md", busy, className, children, disabled, ...rest }: BtnProps) {
  const v = {
    primary: "bg-teal-700 text-white hover:bg-teal-800 shadow-sm",
    secondary: "bg-white text-navy-900 ring-1 ring-sand-300 hover:bg-sand-100",
    ghost: "text-navy-700 hover:bg-sand-100",
    danger: "bg-rose-600 text-white hover:bg-rose-700",
    amber: "bg-amber-600 text-white hover:bg-amber-700",
  }[variant];
  return (
    <button
      {...rest}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:opacity-55 disabled:cursor-not-allowed select-none",
        size === "lg" ? "min-h-14 px-6 text-base" : "min-h-11 px-4 text-sm",
        v, className,
      )}
    >
      {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={cx("rounded-3xl bg-white shadow-card ring-1 ring-sand-200/70", className)}>{children}</div>;
}

export type Tone = "teal" | "amber" | "rose" | "leaf" | "navy" | "sand";
const toneCls: Record<Tone, string> = {
  teal: "bg-teal-50 text-teal-800 ring-teal-100",
  amber: "bg-amber-50 text-amber-700 ring-amber-100",
  rose: "bg-rose-50 text-rose-700 ring-rose-600/20",
  leaf: "bg-leaf-50 text-leaf-700 ring-leaf-600/20",
  navy: "bg-navy-900 text-white ring-navy-900",
  sand: "bg-sand-100 text-navy-700 ring-sand-200",
};
export function Pill({ tone = "sand", icon, children, className }: { tone?: Tone; icon?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 whitespace-nowrap", toneCls[tone], className)}>{icon}{children}</span>;
}

/** Status always uses text + icon + colour. */
export function AttendanceStatus({ status }: { status: string | null }) {
  const m: Record<string, [Tone, React.ReactNode, string]> = {
    pending: ["amber", <Hourglass key="i" className="size-3.5" aria-hidden />, "Pending verification"],
    present: ["leaf", <CheckCircle2 key="i" className="size-3.5" aria-hidden />, "Present"],
    late: ["amber", <Clock key="i" className="size-3.5" aria-hidden />, "Late"],
    absent: ["rose", <XCircle key="i" className="size-3.5" aria-hidden />, "Absent"],
    excused: ["teal", <ShieldCheck key="i" className="size-3.5" aria-hidden />, "Excused"],
  };
  const [tone, icon, label] = m[status ?? ""] ?? ["sand", <Info key="i" className="size-3.5" aria-hidden />, "Not marked"];
  return <Pill tone={tone} icon={icon}>{label}</Pill>;
}

export function CustodyPill({ status }: { status: string }) {
  const m: Record<string, [Tone, React.ReactNode, string]> = {
    in_custody: ["leaf", <ShieldCheck key="i" className="size-3.5" aria-hidden />, "Received by warden"],
    with_student: ["teal", <Smartphone key="i" className="size-3.5" aria-hidden />, "With student"],
    overdue: ["rose", <AlertTriangle key="i" className="size-3.5" aria-hidden />, "Not deposited — overdue"],
    exempt: ["navy", <ShieldCheck key="i" className="size-3.5" aria-hidden />, "Exception active"],
    no_phone: ["sand", <Ban key="i" className="size-3.5" aria-hidden />, "No registered phone"],
  };
  const [tone, icon, label] = m[status] ?? ["sand", null, status];
  return <Pill tone={tone} icon={icon}>{label}</Pill>;
}

export function Banner({ tone = "teal", title, children, icon, action }: { tone?: Tone; title: string; children?: React.ReactNode; icon?: React.ReactNode; action?: React.ReactNode }) {
  const defaultIcon = tone === "rose" ? <XCircle className="size-5" aria-hidden /> : tone === "amber" ? <AlertTriangle className="size-5" aria-hidden /> : tone === "leaf" ? <CheckCircle2 className="size-5" aria-hidden /> : <Info className="size-5" aria-hidden />;
  return (
    <div role={tone === "rose" || tone === "amber" ? "alert" : "status"} className={cx("rise flex gap-3 rounded-2xl p-4 ring-1", toneCls[tone])}>
      <span className="mt-0.5 shrink-0">{icon ?? defaultIcon}</span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        {children && <div className="mt-1 text-sm opacity-90">{children}</div>}
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  );
}

export function ErrorBanner({ error, onRetry }: { error: { code: string; message: string } | null; onRetry?: () => void }) {
  if (!error) return null;
  const titles: Record<string, string> = {
    OFFLINE: "You're offline", EXPIRED_CODE: "Code expired", INVALID_CODE: "Code not recognised", WRONG_PURPOSE: "Wrong kind of code",
    ALREADY_USED: "Already used", ALREADY_RECEIVED: "Already received", ALREADY_RETURNED: "Already returned", ALREADY_JOINED: "Already joined",
    FORBIDDEN: "Permission denied", UNAUTHENTICATED: "Please sign in again", RATE_LIMITED: "Too many attempts", SESSION_CLOSED: "Session closed",
    NOT_ENROLLED: "Not in this class", PENDING_REMAIN: "Pending requests remain", NO_PHONE: "No registered phone", VALIDATION: "Check the details",
  };
  const tone: Tone = error.code === "OFFLINE" ? "amber" : "rose";
  return (
    <Banner tone={tone} title={titles[error.code] ?? "Something went wrong"} icon={error.code === "OFFLINE" ? <CloudOff className="size-5" aria-hidden /> : undefined}
      action={onRetry ? <Button variant="secondary" onClick={onRetry}>Try again</Button> : undefined}>
      {error.message}
    </Banner>
  );
}

export function LastUpdated({ at, stale }: { at: string | null; stale?: boolean }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 15000); return () => clearInterval(t); }, []);
  if (!at) return null;
  return (
    <p className={cx("inline-flex items-center gap-1.5 text-xs", stale ? "text-amber-700 font-semibold" : "text-navy-500")} aria-live="polite">
      {stale ? <CloudOff className="size-3.5" aria-hidden /> : <Clock className="size-3.5" aria-hidden />}
      {stale ? "Offline · last updated " : "Updated "}{relTime(at)}
    </p>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return <div className="flex items-center gap-2 text-navy-500" role="status"><Loader2 className="size-4 animate-spin" aria-hidden />{label}…</div>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-2xl bg-sand-200/70", className)} aria-hidden />;
}

export function Empty({ icon, title, children }: { icon?: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-sand-300 p-6 text-center text-navy-500">
      <span className="text-navy-300">{icon ?? <Info className="size-6" aria-hidden />}</span>
      <p className="font-semibold text-navy-700">{title}</p>
      {children && <div className="text-sm">{children}</div>}
    </div>
  );
}

/** QR rendered as SVG that scales to the container width without cropping. */
export function QR({ value, label, className }: { value: string; label: string; className?: string }) {
  const [svg, setSvg] = useState<string>("");
  useEffect(() => {
    let live = true;
    QRCode.toString(value, { type: "svg", errorCorrectionLevel: "M", margin: 2, color: { dark: "#0b1b36", light: "#ffffff" } }).then((s) => { if (live) setSvg(s); });
    return () => { live = false; };
  }, [value]);
  return (
    <div role="img" aria-label={label} className={cx("aspect-square w-full max-w-[min(100%,420px)] mx-auto rounded-2xl bg-white p-2 [&>svg]:block [&>svg]:h-full [&>svg]:w-full", className)}
      dangerouslySetInnerHTML={{ __html: svg }} />
  );
}

export function CodeText({ code, className }: { code: string; className?: string }) {
  return <span className={cx("code-chars font-bold", className)} aria-label={`Code ${code.split("").join(" ")}`}>{formatCode(code)}</span>;
}

export function Countdown({ to, onExpire, className }: { to: string; onExpire?: () => void; className?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const ms = new Date(to).getTime() - now;
  useEffect(() => { if (ms <= 0) onExpire?.(); }, [ms <= 0]); // eslint-disable-line react-hooks/exhaustive-deps
  if (ms <= 0) return <span className={className}>0:00</span>;
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return <span className={cx("tabular-nums", className)}>{h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}:${String(sec).padStart(2, "0")}`}</span>;
}

export function Stat({ label, value, tone = "sand", icon }: { label: string; value: number | string; tone?: Tone; icon?: React.ReactNode }) {
  return (
    <div className={cx("rounded-2xl p-4 ring-1", toneCls[tone])}>
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide opacity-80">{icon}{label}</div>
      <p className="mt-1 text-3xl font-extrabold tabular-nums">{value}</p>
    </div>
  );
}

export function Field({ label, hint, children, id }: { label: string; hint?: React.ReactNode; children: React.ReactNode; id: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-navy-800">{label}</label>
      {children}
      {hint && <p className="text-xs text-navy-500">{hint}</p>}
    </div>
  );
}

export const inputCls = "min-h-11 w-full rounded-xl border-0 bg-white px-3.5 text-base text-navy-900 ring-1 ring-sand-300 placeholder:text-navy-300 focus:ring-2 focus:ring-teal-500 focus:outline-none";
