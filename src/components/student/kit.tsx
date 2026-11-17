"use client";
import Link from "next/link";
import { ArrowLeft, ChevronDown, CloudOff, Radio } from "lucide-react";
import { cx } from "@/components/ui";

/** Page wrapper: consistent gutters, safe-area top and vertical rhythm for student screens. */
export function StudentPage({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cx("mx-auto flex w-full min-w-0 max-w-xl flex-col gap-5 px-4 pb-4 pt-[calc(0.75rem+var(--safe-top))] sm:px-5 md:pt-6", className)}>
      {children}
    </div>
  );
}

/** Breadcrumb row + large title. `back` adds a 44px back link; `right` is an optional trailing control. */
export function PageHeader({ crumb, title, subtitle, back, right }: { crumb: string; title: React.ReactNode; subtitle?: React.ReactNode; back?: { href: string; label: string }; right?: React.ReactNode }) {
  return (
    <header className="flex flex-col gap-3">
      <div className="flex min-h-11 items-center gap-1">
        {back && (
          <Link href={back.href} aria-label={back.label} className="-ml-2.5 grid size-11 shrink-0 place-items-center rounded-full text-navy-900 hover:bg-sand-100">
            <ArrowLeft className="size-5" aria-hidden />
          </Link>
        )}
        <p className="min-w-0 flex-1 truncate text-[11px] font-bold uppercase tracking-[0.14em] text-navy-500">
          InSync <span aria-hidden className="text-navy-300">/</span> {crumb}
        </p>
        {right}
      </div>
      <div className="min-w-0">
        <h1 className="break-words text-[28px] font-extrabold leading-[1.1] tracking-tight text-navy-950 sm:text-3xl">{title}</h1>
        {subtitle && <div className="mt-1.5 text-sm text-navy-500">{subtitle}</div>}
      </div>
    </header>
  );
}

/** The one dark hero card per screen. `tone` tints the glow for urgent states. */
export function HeroCard({ children, tone = "teal", className }: { children: React.ReactNode; tone?: "teal" | "amber" | "rose" | "leaf"; className?: string }) {
  const glow = {
    teal: "bg-[radial-gradient(120%_90%_at_100%_0%,rgb(19_160_143/0.32),transparent_60%)]",
    amber: "bg-[radial-gradient(120%_90%_at_100%_0%,rgb(180_83_9/0.42),transparent_60%)]",
    rose: "bg-[radial-gradient(120%_90%_at_100%_0%,rgb(180_35_24/0.55),transparent_62%)]",
    leaf: "bg-[radial-gradient(120%_90%_at_100%_0%,rgb(23_128_61/0.45),transparent_60%)]",
  }[tone];
  return (
    <section className={cx("rise relative overflow-hidden rounded-[28px] bg-navy-950 text-white shadow-lift", className)}>
      <div aria-hidden className={cx("pointer-events-none absolute inset-0", glow)} />
      <div className="relative p-5 sm:p-6">{children}</div>
    </section>
  );
}

/** Live / offline chip — icon + text + colour. */
export function LiveChip({ at, stale, dark }: { at: string | null; stale: boolean; dark?: boolean }) {
  if (!at) return null;
  return (
    <span className={cx("inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold",
      stale ? "bg-amber-600 text-white" : dark ? "bg-white/10 text-white/80" : "bg-white text-navy-700 ring-1 ring-sand-200")}>
      {stale ? <CloudOff className="size-3" aria-hidden /> : <Radio className="size-3" aria-hidden />}
      {stale ? "Offline" : "Live"}
    </span>
  );
}

/** Thin progress bar for dark or light surfaces. */
export function Progress({ pct, label, dark, warn }: { pct: number; label: string; dark?: boolean; warn?: boolean }) {
  const v = Math.max(0, Math.min(100, pct));
  return (
    <div className={cx("h-2 overflow-hidden rounded-full", dark ? "bg-white/12" : "bg-sand-200")} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v)} aria-label={label}>
      <div className={cx("h-full rounded-full transition-[width] duration-1000", warn ? "bg-amber-600" : "bg-teal-500")} style={{ width: `${v}%` }} />
    </div>
  );
}

/** White rounded card for secondary content. */
export function Panel({ children, className, ...rest }: React.HTMLAttributes<HTMLElement>) {
  return <section {...rest} className={cx("rounded-[24px] bg-white shadow-card ring-1 ring-sand-200/70", className)}>{children}</section>;
}

/** Progressive disclosure row: compact summary, details on demand. */
export function Disclosure({ icon, title, meta, children, open, onToggle, className, id }: {
  icon?: React.ReactNode; title: React.ReactNode; meta?: React.ReactNode; children: React.ReactNode;
  open?: boolean; onToggle?: (open: boolean) => void; className?: string; id?: string;
}) {
  return (
    <details id={id} open={open} onToggle={onToggle ? (e) => onToggle(e.currentTarget.open) : undefined}
      className={cx("group rounded-[24px] bg-white shadow-card ring-1 ring-sand-200/70", className)}>
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-[24px] px-4 py-3 sm:px-5 [&::-webkit-details-marker]:hidden">
        {icon && <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700">{icon}</span>}
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-navy-900">{title}</span>
          {meta && <span className="block truncate text-xs text-navy-500">{meta}</span>}
        </span>
        <ChevronDown className="size-5 shrink-0 text-navy-500 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="px-4 pb-4 sm:px-5 sm:pb-5">{children}</div>
    </details>
  );
}

/** Small muted explanation card. */
export function Note({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cx("rounded-[20px] bg-sand-100 p-4 text-sm leading-relaxed text-navy-700", className)}>{children}</div>;
}

export const primaryBtn = "inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl px-5 text-base font-bold transition-colors";
