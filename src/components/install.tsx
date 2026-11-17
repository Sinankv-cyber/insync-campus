"use client";
import { useEffect, useState } from "react";
import { Bell, BellOff, Download, Share, SquarePlus, X } from "lucide-react";
import { api } from "@/lib/client";
import { Banner, Button, Card } from "./ui";
import { useMe } from "./session";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferred: BIPEvent | null = null;
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e as BIPEvent; });
}

function platform() {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && "ontouchend" in document)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}
function standalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

export function InstallGuide({ compact, onDismiss }: { compact?: boolean; onDismiss?: () => void }) {
  const [p, setP] = useState("other");
  const [installed, setInstalled] = useState(false);
  const [canPrompt, setCanPrompt] = useState(false);
  useEffect(() => {
    setP(platform()); setInstalled(standalone()); setCanPrompt(Boolean(deferred)); // eslint-disable-line react-hooks/set-state-in-effect
    const h = () => setCanPrompt(true);
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);
  if (installed) return compact ? null : <Banner tone="leaf" title="Installed">InSync is running as an installed app on this device.</Banner>;
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-navy-900 text-teal-500"><Download className="size-5" aria-hidden /></span>
          <div>
            <p className="font-semibold">Add InSync to your home screen</p>
            <p className="ml text-sm text-navy-500">ഹോം സ്ക്രീനിൽ ചേർക്കൂ — വേഗത്തിൽ തുറക്കാം.</p>
          </div>
        </div>
        {onDismiss && <button onClick={onDismiss} aria-label="Dismiss install guidance" className="grid size-11 shrink-0 place-items-center rounded-xl text-navy-500 hover:bg-sand-100"><X className="size-5" aria-hidden /></button>}
      </div>
      <ol className="mt-4 flex flex-col gap-2 text-sm text-navy-700">
        {p === "ios" && <>
          <li className="flex items-center gap-2"><span className="font-bold">1.</span> Open this page in <b>Safari</b>.</li>
          <li className="flex items-center gap-2"><span className="font-bold">2.</span> Tap <Share className="size-4" aria-label="Share" /> <b>Share</b>.</li>
          <li className="flex items-center gap-2"><span className="font-bold">3.</span> Choose <SquarePlus className="size-4" aria-hidden /> <b>Add to Home Screen</b>, then open InSync from the icon.</li>
          <li className="text-xs text-navy-500">On iPhone, notifications only work after opening the Home Screen app (iOS 16.4+).</li>
        </>}
        {p === "android" && (canPrompt
          ? <li><Button onClick={async () => { await deferred?.prompt(); deferred = null; setCanPrompt(false); }}><Download className="size-4" aria-hidden />Install app</Button></li>
          : <>
            <li><span className="font-bold">1.</span> In Chrome, tap the <b>⋮</b> menu.</li>
            <li><span className="font-bold">2.</span> Tap <b>Install app</b> or <b>Add to Home screen</b>.</li>
          </>)}
        {(p === "desktop" || p === "other") && (canPrompt
          ? <li><Button onClick={async () => { await deferred?.prompt(); deferred = null; setCanPrompt(false); }}><Download className="size-4" aria-hidden />Install InSync</Button></li>
          : <li>In Chrome or Edge, use the install icon in the address bar. Staff can also simply keep this tab open — everything works in the browser.</li>)}
      </ol>
    </Card>
  );
}

function urlB64ToUint8Array(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const b = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...b].map((c) => c.charCodeAt(0)));
}

/** Push permission is requested only from this explicit button. */
export function NotificationSettings() {
  const { me } = useMe();
  const [perm, setPerm] = useState<string>("default");
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "leaf" | "amber" | "rose"; text: string } | null>(null);
  const supported = typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
  useEffect(() => {
    if (!supported) return;
    setPerm(Notification.permission); // eslint-disable-line react-hooks/set-state-in-effect
    navigator.serviceWorker.getRegistration().then((r) => r?.pushManager.getSubscription()).then((s) => setSubscribed(Boolean(s))).catch(() => {});
  }, [supported]);

  async function enable() {
    setBusy(true); setMsg(null);
    try {
      const p = await Notification.requestPermission();
      setPerm(p);
      if (p !== "granted") { setMsg({ tone: "amber", text: "Permission not granted. You will still see alerts inside InSync." }); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(me!.env.vapidPublicKey!) });
      const r = await api<{ testDelivery: string }>("/api/push", { method: "POST", body: sub.toJSON() });
      if (!r.ok) { setMsg({ tone: "rose", text: r.error.message }); return; }
      setSubscribed(true);
      setMsg({ tone: "leaf", text: r.data.testDelivery === "sent_to_push_service" ? "Test notification handed to your browser's push service. Delivery can be delayed by the device." : `Subscribed, but the test was not delivered (${r.data.testDelivery}).` });
    } catch (e) {
      setMsg({ tone: "rose", text: `Could not enable notifications: ${(e as Error).message}` });
    } finally { setBusy(false); }
  }

  async function disable() {
    setBusy(true);
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) { await api("/api/push", { method: "DELETE", body: { endpoint: sub.endpoint } }); await sub.unsubscribe(); }
    setSubscribed(false); setBusy(false);
  }

  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-teal-50 text-teal-700">{subscribed ? <Bell className="size-5" aria-hidden /> : <BellOff className="size-5" aria-hidden />}</span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Notifications</p>
          {!me?.env.push ? <p className="text-sm text-navy-500">Web Push is not configured on this server. Alerts still appear inside InSync.</p>
            : !supported ? <p className="text-sm text-navy-500">This browser does not support web notifications here. On iPhone, install to the Home Screen first.</p>
            : perm === "denied" ? <p className="text-sm text-navy-500">Notifications are blocked in your browser settings.</p>
            : <p className="text-sm text-navy-500">{subscribed ? "On for this device." : "Get receipts and deadline alerts on this device."} Delivery depends on your browser and can be delayed.</p>}
          {me?.env.push && supported && perm !== "denied" && (
            <div className="mt-3">{subscribed ? <Button variant="secondary" busy={busy} onClick={disable}>Turn off on this device</Button> : <Button busy={busy} onClick={enable}><Bell className="size-4" aria-hidden />Enable notifications</Button>}</div>
          )}
          {msg && <div className="mt-3"><Banner tone={msg.tone} title={msg.tone === "leaf" ? "Notifications" : "Notifications"}>{msg.text}</Banner></div>}
        </div>
      </div>
    </Card>
  );
}
