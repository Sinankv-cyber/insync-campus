"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLockup } from "./brand";
import { CalendarCheck2, ClipboardList, Home, LogOut, ScanLine, Settings2, User, CloudOff, Database } from "lucide-react";
import { logout } from "@/lib/client";
import { SessionGate, useMe, type Role } from "./session";
import { cx } from "./ui";

function ModeBadge({ dark }: { dark?: boolean }) {
  const { me } = useMe();
  if (!me) return null;
  const neon = me.env.storage === "neon";
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold", dark ? "bg-white/10 text-white/80" : "bg-sand-100 text-navy-600")} title={neon ? "Connected database: Neon Postgres" : "Local SQLite demo mode — this server only"}>
      <Database className="size-3" aria-hidden />{neon ? "Neon" : "Local demo DB"}
    </span>
  );
}

function OfflineStrip() {
  const { offline } = useMe();
  if (!offline) return null;
  return (
    <div role="status" className="sticky top-0 z-40 flex items-center justify-center gap-2 bg-amber-600 px-4 py-2 text-sm font-semibold text-white">
      <CloudOff className="size-4" aria-hidden /> Offline — showing last saved data. Nothing new can be confirmed until you reconnect.
    </div>
  );
}

const STUDENT_NAV = [
  { href: "/today", label: "Today", icon: Home },
  { href: "/attendance", label: "Attendance", icon: CalendarCheck2 },
  { href: "/history", label: "History", icon: ClipboardList },
  { href: "/profile", label: "Profile", icon: User },
];

export function StudentShell({ children }: { children: React.ReactNode }) {
  return (
    <SessionGate roles={["student"]}>
      <StudentFrame>{children}</StudentFrame>
    </SessionGate>
  );
}

function StudentFrame({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  // The pass screen is reached from Today, so Today stays highlighted there.
  const isActive = (href: string) => path.startsWith(href) || (href === "/today" && path.startsWith("/pass"));
  return (
    <div className="min-h-dvh pb-[calc(6.75rem+var(--safe-bottom))] md:pb-12">
      <OfflineStrip />
      <header className="mx-auto hidden max-w-xl items-center justify-between gap-4 px-5 pt-6 md:flex">
        <Link href="/today" aria-label="InSync home" className="flex items-center"><BrandLockup dark={false} size="sm" /></Link>
        <nav aria-label="Main" className="flex gap-1 rounded-full bg-navy-950 p-1 shadow-lift">
          {STUDENT_NAV.map((n) => {
            const active = isActive(n.href);
            return (
              <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined}
                className={cx("flex min-h-11 items-center gap-2 rounded-full px-3.5 text-sm font-semibold transition-colors", active ? "bg-teal-500 text-navy-950" : "text-white/75 hover:bg-white/10 hover:text-white")}>
                <n.icon className="size-4" aria-hidden />{n.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto max-w-xl">{children}</main>
      <nav aria-label="Main" className="fixed inset-x-3 bottom-[calc(0.75rem+var(--safe-bottom))] z-30 mx-auto max-w-md rounded-[26px] bg-navy-950 px-1.5 shadow-lift ring-1 ring-white/5 md:hidden">
        <ul className="grid grid-cols-4">
          {STUDENT_NAV.map((n) => {
            const active = isActive(n.href);
            return (
              <li key={n.href}>
                <Link href={n.href} aria-current={active ? "page" : undefined}
                  className={cx("relative flex min-h-[4.25rem] flex-col items-center justify-center gap-1 rounded-[20px] text-[11px] font-semibold transition-colors", active ? "text-teal-100" : "text-white/65 hover:text-white")}>
                  <n.icon className={cx("size-[22px]", active && "text-teal-500")} strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                  {n.label}
                  <span aria-hidden className={cx("absolute bottom-2 h-[3px] w-5 rounded-full bg-teal-500 transition-opacity", active ? "opacity-100" : "opacity-0")} />
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

const STAFF_NAV: { href: string; label: string; icon: typeof Home; roles: Role[] }[] = [
  { href: "/teacher", label: "Teacher Session", icon: CalendarCheck2, roles: ["teacher", "admin"] },
  { href: "/warden", label: "Warden Today", icon: ScanLine, roles: ["warden", "admin"] },
  { href: "/admin", label: "Administration", icon: Settings2, roles: ["admin"] },
];

export function StaffShell({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  return (
    <SessionGate roles={roles}>
      <StaffFrame>{children}</StaffFrame>
    </SessionGate>
  );
}

function StaffFrame({ children }: { children: React.ReactNode }) {
  const { me } = useMe();
  const path = usePathname();
  const role = me!.user!.role;
  const items = STAFF_NAV.filter((n) => n.roles.includes(role));
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="campus-hero relative hidden flex-col justify-between p-5 text-white lg:flex lg:sticky lg:top-0 lg:h-dvh">
        <div>
          <Link href="/" aria-label="InSync home" className="flex flex-col items-start gap-1.5"><BrandLockup size="md" /><span className="font-brand text-[10px] font-light uppercase tracking-[0.38em] text-white/60">Everything in sync.</span></Link>
          <nav aria-label="Staff" className="mt-8 flex flex-col gap-1">
            {items.map((n) => {
              const active = path.startsWith(n.href);
              return (
                <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined}
                  className={cx("flex min-h-11 items-center gap-3 rounded-xl px-3 font-semibold", active ? "bg-white text-navy-900" : "text-white/80 hover:bg-white/10")}>
                  <n.icon className="size-5" aria-hidden />{n.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex flex-col gap-3">
          <ModeBadge dark />
          <div className="rounded-2xl bg-white/8 p-3 ring-1 ring-white/10">
            <p className="truncate font-semibold">{me!.user!.name}</p>
            <p className="truncate text-xs text-white/60"><span className="capitalize">{role}</span> · {me!.user!.email}</p>
          </div>
          <button onClick={logout} className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-white/80 hover:bg-white/10"><LogOut className="size-4" aria-hidden />Sign out</button>
        </div>
      </aside>
      <div className="min-w-0">
        <OfflineStrip />
        <header className="campus-hero sticky top-0 z-20 flex items-center justify-between gap-2 px-4 pb-3 pt-[calc(0.75rem+var(--safe-top))] text-white lg:hidden">
          <Link href="/" aria-label="InSync home" className="flex min-h-11 items-center"><BrandLockup size="sm" /></Link>
          <div className="flex items-center gap-1">
            <ModeBadge dark />
            <button onClick={logout} aria-label="Sign out" className="grid size-11 place-items-center rounded-xl hover:bg-white/10"><LogOut className="size-5" aria-hidden /></button>
          </div>
        </header>
        {items.length > 1 && (
          <nav aria-label="Staff sections" className="flex gap-1 overflow-x-auto border-b border-sand-200 bg-white px-3 py-2 lg:hidden">
            {items.map((n) => (
              <Link key={n.href} href={n.href} aria-current={path.startsWith(n.href) ? "page" : undefined}
                className={cx("flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-semibold", path.startsWith(n.href) ? "bg-navy-900 text-white" : "text-navy-600")}>
                <n.icon className="size-4" aria-hidden />{n.label}
              </Link>
            ))}
          </nav>
        )}
        <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6 lg:px-8 lg:py-8 pb-[calc(2rem+var(--safe-bottom))]">{children}</main>
      </div>
    </div>
  );
}
