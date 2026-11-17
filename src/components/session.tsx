"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, cacheGet, cacheSet } from "@/lib/client";

export type Role = "student" | "teacher" | "warden" | "admin";
export type Me = {
  user: { id: string; email: string; name: string; role: Role; roll_no: string | null; room: string | null; hostel_name: string | null } | null;
  enrollments?: { id: string; name: string; subject_code: string; status: string }[];
  env: { storage: "neon" | "sqlite"; push: boolean; vapidPublicKey: string | null; google: boolean; scheduler: string };
};

const Ctx = createContext<{ me: Me | null; offline: boolean; refresh: () => Promise<void> }>({ me: null, offline: false, refresh: async () => {} });

export function useMe() { return useContext(Ctx); }

export function homeFor(role: Role) {
  return role === "student" ? "/today" : role === "teacher" ? "/teacher" : role === "warden" ? "/warden" : "/admin";
}

/** Client-side gate for UX only. Every server operation re-checks identity and role. */
export function SessionGate({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [offline, setOffline] = useState(false);
  const [denied, setDenied] = useState(false);

  const refresh = useCallback(async () => {
    const r = await api<Me>("/api/me");
    if (r.ok) {
      setOffline(false);
      if (!r.data.user) { router.replace("/login"); return; }
      if (!roles.includes(r.data.user.role)) { setDenied(true); setMe(r.data); return; }
      setMe(r.data);
      try { localStorage.setItem("hp:lastUser", r.data.user.id); } catch {}
      cacheSet(r.data.user.id, "me", r.data);
    } else if (r.error.code === "OFFLINE") {
      setOffline(true);
      let uid: string | null = null;
      try { uid = localStorage.getItem("hp:lastUser"); } catch {}
      const c = uid ? cacheGet<Me>(uid, "me") : null;
      if (c?.data.user && roles.includes(c.data.user.role)) setMe(c.data);
    }
  }, [roles, router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    const on = () => { setOffline(false); refresh(); };
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, [refresh]);

  if (denied && me?.user) {
    return (
      <main className="min-h-dvh grid place-items-center p-6">
        <div className="max-w-sm text-center rounded-3xl bg-white p-8 shadow-card">
          <p className="text-4xl" aria-hidden>🔒</p>
          <h1 className="mt-3 text-xl font-bold">Permission denied</h1>
          <p className="mt-2 text-navy-500">This page is for {roles.join(" / ")} accounts. You are signed in as a {me.user.role}.</p>
          <a href={homeFor(me.user.role)} className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-teal-700 px-5 font-semibold text-white">Go to my home</a>
        </div>
      </main>
    );
  }
  if (!me) {
    return (
      <main className="min-h-dvh grid place-items-center p-6" aria-busy="true">
        <div className="flex flex-col items-center gap-3 text-navy-500">
          <span className="size-10 rounded-full border-4 border-teal-100 border-t-teal-600 animate-spin" aria-hidden />
          <p>{offline ? "Offline — no saved data on this device yet." : "Loading InSync…"}</p>
        </div>
      </main>
    );
  }
  return <Ctx.Provider value={{ me, offline, refresh }}>{children}</Ctx.Provider>;
}
