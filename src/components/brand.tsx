import { useId } from "react";

/** InSync. brand — interlocking "S" link mark, thin geometric wordmark with aqua full stop, tagline. */
export const BRAND = { name: "InSync", tagline: "Everything in sync." } as const;

export function LogoMark({ className, title = "InSync" }: { className?: string; title?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 330 200" className={className} role="img" aria-label={title} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={`${id}a`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#16F2DC" />
          <stop offset="0.55" stopColor="#E9FFFC" />
          <stop offset="1" stopColor="#0B9E92" />
        </linearGradient>
        <linearGradient id={`${id}b`} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#16F2DC" />
          <stop offset="0.45" stopColor="#F2FFFD" />
          <stop offset="1" stopColor="#0A8F85" />
        </linearGradient>
      </defs>
      <path d="M118 24 C 62 2, 14 46, 26 104 C 36 152, 92 176, 140 148 L 196 100" fill="none" stroke={`url(#${id}a)`} strokeWidth="42" strokeLinecap="round" />
      <path d="M212 176 C 268 198, 316 154, 304 96 C 294 48, 238 24, 190 52 L 134 100" fill="none" stroke={`url(#${id}b)`} strokeWidth="42" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark({ className, dark = true }: { className?: string; dark?: boolean }) {
  return (
    <span className={`font-brand font-extralight tracking-[0.02em] ${dark ? "text-white" : "text-navy-900"} ${className ?? ""}`}>
      InSync<span className="text-aqua-400">.</span>
    </span>
  );
}

export function Tagline({ className, dark = true }: { className?: string; dark?: boolean }) {
  return <span className={`font-brand font-light uppercase tracking-[0.42em] ${dark ? "text-white/70" : "text-navy-500"} ${className ?? ""}`}>Everything in sync.</span>;
}

/** Compact lockup for headers/nav: mark + wordmark. */
export function BrandLockup({ dark = true, size = "md", className }: { dark?: boolean; size?: "sm" | "md" | "lg"; className?: string }) {
  const mark = size === "lg" ? "h-10 w-16" : size === "sm" ? "h-6 w-10" : "h-8 w-12";
  const text = size === "lg" ? "text-3xl" : size === "sm" ? "text-lg" : "text-2xl";
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      {dark ? <LogoMark className={mark} /> : <span className="grid place-items-center rounded-xl bg-navy-950 px-1.5 py-1"><LogoMark className={mark} /></span>}
      <Wordmark dark={dark} className={`${text} leading-none`} />
    </span>
  );
}
