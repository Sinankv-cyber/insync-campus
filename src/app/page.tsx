"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { homeFor, type Me } from "@/components/session";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    api<Me>("/api/me").then((r) => {
      if (r.ok && r.data.user) router.replace(homeFor(r.data.user.role));
      else if (r.ok) router.replace("/login");
      else {
        let uid = null; try { uid = localStorage.getItem("hp:lastUser"); } catch {}
        router.replace(uid ? "/today" : "/login");
      }
    });
  }, [router]);
  return (
    <main className="min-h-dvh grid place-items-center campus-hero text-white">
      <div className="flex flex-col items-center gap-3"><span className="size-10 rounded-full border-4 border-white/20 border-t-teal-500 animate-spin" aria-hidden /><p>Opening InSync…</p></div>
    </main>
  );
}
