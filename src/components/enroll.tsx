"use client";
import { useState } from "react";
import { GraduationCap } from "lucide-react";
import { api } from "@/lib/client";
import { Banner, Button, Card, ErrorBanner, Field } from "./ui";
import { CodeInput } from "./scanner";
import { useMe } from "./session";

/** New (e.g. Google sign-in) students join a class with the teacher's class code; the teacher approves. */
export function EnrollCard({ pending }: { pending: { id: string; name: string }[] }) {
  const { refresh } = useMe();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; message: string } | null>(null);
  const [done, setDone] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const r = await api<{ className: string; status: string }>("/api/student/enroll", { method: "POST", body: { code } });
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setDone(`${r.data.className}: ${r.data.status === "approved" ? "already approved" : "request sent — waiting for teacher approval"}`);
    setCode("");
    refresh();
  }
  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-amber-50 text-amber-700"><GraduationCap className="size-5" aria-hidden /></span>
        <div><p className="font-semibold">Join your class</p><p className="text-sm text-navy-500">Enter the class code your teacher gives you. Your teacher approves the request before attendance opens for you.</p></div>
      </div>
      {pending.length > 0 && <div className="mt-3"><Banner tone="amber" title="Waiting for approval">{pending.map((p) => p.name).join(", ")}</Banner></div>}
      <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
        <Field id="enroll-code" label="Class code" hint={<span id="enroll-code-hint">8 letters/numbers, e.g. CS2K-RM7P</span>}><CodeInput id="enroll-code" value={code} onChange={setCode} /></Field>
        <ErrorBanner error={err} />
        {done && <Banner tone="leaf" title="Request saved">{done}</Banner>}
        <Button type="submit" busy={busy} disabled={code.replace("-", "").length !== 8}>Send join request</Button>
      </form>
    </Card>
  );
}
