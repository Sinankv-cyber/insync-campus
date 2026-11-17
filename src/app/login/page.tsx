"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BrandLockup } from "@/components/brand";
import { QrCode, Smartphone, Users } from "lucide-react";
import { api } from "@/lib/client";
import { Banner, Button, Field, inputCls } from "@/components/ui";
import { homeFor, type Me, type Role } from "@/components/session";

const GOOGLE_ERRORS: Record<string, string> = {
  google_not_configured: "Google sign-in is not configured on this server. Use email and password.",
  google_state: "The Google sign-in expired. Please try again.",
  google_exchange: "Google could not confirm the sign-in. Please try again.",
  google_email: "Your Google email must be verified.",
  account_disabled: "This account is disabled. Contact the college office.",
};

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(GOOGLE_ERRORS[params.get("error") || ""] ?? null);
  const [touched, setTouched] = useState(false);
  const [env, setEnv] = useState<Me["env"] | null>(null);

  useEffect(() => {
    api<Me>("/api/me").then((r) => {
      if (r.ok) { setEnv(r.data.env); if (r.data.user) router.replace(homeFor(r.data.user.role)); }
    });
  }, [router]);

  const emailInvalid = touched && !/^\S+@\S+\.\S+$/.test(email);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!/^\S+@\S+\.\S+$/.test(email) || !password) { setErr("Enter your college email and password."); return; }
    setBusy(true); setErr(null);
    const r = await api<{ role: Role }>("/api/auth/login", { method: "POST", body: { email, password } });
    setBusy(false);
    if (!r.ok) { setErr(r.error.message); return; }
    try { sessionStorage.setItem("hp:justSignedIn", "1"); } catch {}
    router.replace(homeFor(r.data.role));
  }

  return (
    <main className="min-h-dvh grid lg:grid-cols-[1.1fr_1fr]">
      <section className="campus-hero grain relative overflow-hidden px-6 pb-10 pt-[calc(2.5rem+var(--safe-top))] text-white lg:px-14 lg:py-16 flex flex-col justify-between">
        <div className="relative flex items-center gap-3">
          <div className="flex flex-col gap-2"><BrandLockup size="lg" /><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">Smart Campus · Connected Learning</p></div>
        </div>
        <div className="relative mt-10 lg:mt-0 max-w-lg">
          <h1 className="text-3xl font-extrabold leading-tight sm:text-4xl lg:text-5xl">
            <span className="block">Smarter Attendance.</span>
            <span className="block text-teal-500">Connected Learning.</span>
            <span className="block">One Campus.</span>
          </h1>
          <p className="mt-4 text-white/80 sm:text-lg">Bringing attendance, digital devices, and campus learning together in one seamless experience.</p>
          <ol className="mt-8 grid grid-cols-3 gap-2 sm:gap-4">
            {([
              ["01", QrCode, "Smart Attendance", "Scan. Verify. Present."],
              ["02", Smartphone, "Device Integration", "Technology with purpose."],
              ["03", Users, "Connected Campus", "Students and staff in sync."],
            ] as const).map(([n, I, t, s]) => (
              <li key={n} className="min-w-0 rounded-xl bg-white/8 p-2.5 ring-1 ring-white/10 sm:rounded-2xl sm:p-4">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] font-bold tracking-widest text-teal-500 sm:text-xs">{n}</span>
                  <I className="size-4 text-teal-500 sm:size-5" aria-hidden />
                </div>
                <p className="mt-1.5 text-xs font-semibold leading-snug sm:mt-2 sm:text-sm">{t}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-white/65 sm:text-sm">{s}</p>
              </li>
            ))}
          </ol>
        </div>
        <p className="relative mt-8 text-xs text-white/60 sm:text-sm">Making technology a meaningful part of education, not a distraction.</p>
      </section>

      <section className="flex items-start justify-center px-5 py-8 lg:items-center lg:py-16 pb-[calc(2rem+var(--safe-bottom))]">
        <div className="w-full max-w-md">
          <h2 className="text-2xl font-extrabold">Welcome to InSync</h2>
          <p className="mt-1 text-navy-500">Your connected campus experience starts here.</p>

          {env?.google !== false && (
            <a href="/api/auth/google" className="mt-6 flex min-h-12 w-full items-center justify-center gap-3 rounded-xl bg-white font-semibold ring-1 ring-sand-300 hover:bg-sand-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2">
              <svg viewBox="0 0 48 48" className="size-5" aria-hidden><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
              Continue with Google
            </a>
          )}
          {env?.google !== false && <p className="mt-2 text-xs text-navy-500">New students can join their class using a teacher-provided code after signing in.</p>}

          <div className="my-6 flex items-center gap-3 text-xs text-navy-500"><span className="h-px flex-1 bg-sand-300" />or continue with email<span className="h-px flex-1 bg-sand-300" /></div>

          <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            <Field id="email" label="College Email" hint={emailInvalid ? <span className="text-rose-700">Enter a valid email like name@college.edu</span> : undefined}>
              <input id="email" type="email" inputMode="email" autoComplete="username" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} onBlur={() => setTouched(true)} aria-invalid={emailInvalid || undefined} placeholder="ameen@insync.test" />
            </Field>
            <Field id="password" label="Password">
              <input id="password" type="password" autoComplete="current-password" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            {err && <Banner tone="rose" title="Couldn't sign in">{err}</Banner>}
            <Button type="submit" size="lg" busy={busy}>Sign In</Button>
          </form>

          {env && (
            <p className="mt-6 inline-flex items-center gap-2 rounded-full bg-sand-100 px-3 py-1 text-xs text-navy-600">
              <span className={`size-2 rounded-full ${env.storage === "neon" ? "bg-teal-500" : "bg-amber-600"}`} aria-hidden />
              Data: {env.storage === "neon" ? "Neon Postgres (connected)" : "Local SQLite demo mode (this server only)"}
            </p>
          )}
        </div>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return <Suspense fallback={null}><LoginInner /></Suspense>;
}
