"use client";
import { useRef } from "react";
import { Hourglass, QrCode, Flag, Users } from "lucide-react";
import { cx } from "@/components/ui";
import type { Session, Tab } from "./types";

/** Phone/tablet-only bottom tab bar for the session view. Hidden at xl, where all panels show side by side. */
export function SessionTabBar({ tab, onTab, pending, status }: { tab: Tab; onTab: (t: Tab) => void; pending: number; status: Session["session"]["status"] }) {
  const refs = useRef<Record<Tab, HTMLButtonElement | null>>({ live: null, pending: null, roster: null });
  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "live", label: status === "open" ? "Live" : status === "closed" ? "Finish" : "Summary", icon: status === "open" ? <QrCode className="size-5" aria-hidden /> : <Flag className="size-5" aria-hidden /> },
    { id: "pending", label: "Pending", icon: <Hourglass className="size-5" aria-hidden /> },
    { id: "roster", label: "Roster", icon: <Users className="size-5" aria-hidden /> },
  ];
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = tabs[(i + d + tabs.length) % tabs.length].id;
    onTab(next);
    refs.current[next]?.focus();
  };
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 px-3 pb-[calc(0.75rem+var(--safe-bottom))] xl:hidden">
      <div role="tablist" aria-label="Session views" className="mx-auto grid max-w-md grid-cols-3 gap-1 rounded-3xl bg-navy-950 p-1.5 shadow-lift">
        {tabs.map((t, i) => {
          const on = tab === t.id;
          return (
            <button key={t.id} ref={(el) => { refs.current[t.id] = el; }} role="tab" id={`tab-${t.id}`} aria-selected={on} aria-controls={`panel-${t.id}`} tabIndex={on ? 0 : -1}
              onClick={() => onTab(t.id)} onKeyDown={(e) => onKey(e, i)}
              className={cx("relative flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-2xl text-xs font-semibold transition-colors",
                on ? "bg-teal-50 text-navy-900" : "text-white/75 hover:bg-white/10 hover:text-white")}>
              {t.icon}
              <span>{t.label}{t.id === "pending" && pending > 0 ? ` (${pending})` : ""}</span>
              {t.id === "pending" && pending > 0 && !on && <span className="absolute right-3 top-2 size-2.5 rounded-full bg-amber-600 ring-2 ring-navy-950" aria-hidden />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
