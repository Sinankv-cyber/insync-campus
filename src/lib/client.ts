"use client";

export type ApiErr = { code: string; message: string; [k: string]: unknown };
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiErr };

/** Fetch wrapper with consistent result shape. Network failure -> OFFLINE (nothing confirmed). */
export async function api<T>(path: string, init?: { method?: string; body?: unknown; signal?: AbortSignal }): Promise<ApiResult<T>> {
  if (typeof navigator !== "undefined" && !navigator.onLine && init?.method && init.method !== "GET") {
    return { ok: false, error: { code: "OFFLINE", message: "You are offline. Nothing was saved — try again when connected." } };
  }
  try {
    const res = await fetch(path, {
      method: init?.method ?? "GET",
      headers: init?.body !== undefined ? { "content-type": "application/json" } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
      credentials: "same-origin",
      signal: init?.signal,
    });
    const json = await res.json().catch(() => null);
    if (json && typeof json === "object" && "ok" in json) return json as ApiResult<T>;
    return { ok: false, error: { code: "SERVER_ERROR", message: `Unexpected response (${res.status}).` } };
  } catch (e) {
    if ((e as Error)?.name === "AbortError") return { ok: false, error: { code: "ABORTED", message: "Cancelled" } };
    return { ok: false, error: { code: "OFFLINE", message: "Can't reach InSync. Check your connection — nothing was saved." } };
  }
}

// ---- Per-user last-known cache (cleared on logout) ----
const PREFIX = "hp:cache:";
export function cacheSet(userId: string, key: string, data: unknown) {
  try { localStorage.setItem(`${PREFIX}${userId}:${key}`, JSON.stringify({ at: new Date().toISOString(), data })); } catch {}
}
export function cacheGet<T>(userId: string, key: string): { at: string; data: T } | null {
  try { const s = localStorage.getItem(`${PREFIX}${userId}:${key}`); return s ? JSON.parse(s) : null; } catch { return null; }
}
export function cacheClearAll() {
  try { for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX) || k.startsWith("hp:")) localStorage.removeItem(k); } catch {}
  try { navigator.serviceWorker?.controller?.postMessage({ type: "CLEAR_USER_DATA" }); } catch {}
}

export async function logout() {
  cacheClearAll();
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    const sub = await reg?.pushManager?.getSubscription();
    if (sub) { await api("/api/push", { method: "DELETE", body: { endpoint: sub.endpoint } }); await sub.unsubscribe(); }
  } catch {}
  await api("/api/auth/logout", { method: "POST" });
  window.location.href = "/login";
}

// ---- Formatting (always Asia/Kolkata for schedule display) ----
export const TZ = "Asia/Kolkata";
export function fmtTime(iso?: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-IN", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso)).toUpperCase();
}
export function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-IN", { timeZone: TZ, day: "numeric", month: "short" }).format(new Date(iso));
}
export function fmtDateTime(iso?: string | null) {
  if (!iso) return "—";
  return `${fmtDate(iso)}, ${fmtTime(iso)}`;
}
export function fmtWeekday(iso?: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-IN", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" }).format(new Date(iso));
}
export function relTime(iso: string, now = Date.now()) {
  const s = Math.round((new Date(iso).getTime() - now) / 1000);
  const a = Math.abs(s);
  const r = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (a < 60) return r.format(s, "second");
  if (a < 3600) return r.format(Math.round(s / 60), "minute");
  if (a < 86400) return r.format(Math.round(s / 3600), "hour");
  return r.format(Math.round(s / 86400), "day");
}
export function formatCode(code: string) {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}
export function hhmmLabel(hhmm: string) {
  if (!/^\d\d:\d\d$/.test(hhmm)) return hhmm;
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(Date.UTC(2000, 0, 1, h, m));
  return new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", hour: "numeric", minute: "2-digit", hour12: true }).format(d).toUpperCase();
}
