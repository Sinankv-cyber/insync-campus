"use client";
import { Loader2 } from "lucide-react";
import { cx } from "@/components/ui";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & { tone: "mint" | "light" | "onDark"; busy?: boolean; size?: "md" | "lg" };

/** Buttons for tones the shared Button has no variant for (mint primary, buttons on the navy card). */
export function ActionButton({ tone, busy, size = "md", className, children, disabled, ...rest }: Props) {
  const t = {
    mint: "bg-teal-500 text-navy-950 hover:bg-teal-600 hover:text-white shadow-sm",
    light: "bg-white text-navy-900 hover:bg-sand-100",
    onDark: "bg-white/5 text-white ring-1 ring-white/25 hover:bg-white/15",
  }[tone];
  return (
    <button {...rest} disabled={disabled || busy} aria-busy={busy || undefined}
      className={cx("inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors select-none disabled:cursor-not-allowed disabled:opacity-55",
        size === "lg" ? "min-h-14 px-6 text-base" : "min-h-11 px-4 text-sm", t, className)}>
      {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}
