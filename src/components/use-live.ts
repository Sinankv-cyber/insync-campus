"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, cacheGet, cacheSet, type ApiErr } from "@/lib/client";
import { useMe } from "./session";

/**
 * Lightweight polling while the page is visible, with a dated last-known copy for offline use.
 * Stale cached data is always labelled; it is never presented as freshly confirmed.
 */
export function useLive<T>(path: string | null, intervalMs = 15000) {
  const { me } = useMe();
  const uid = me?.user?.id ?? "anon";
  const [data, setData] = useState<T | null>(() => (path ? cacheGet<T>(uid, path)?.data ?? null : null));
  const [at, setAt] = useState<string | null>(() => (path ? cacheGet<T>(uid, path)?.at ?? null : null));
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<ApiErr | null>(null);
  const [loading, setLoading] = useState(true);
  const pathRef = useRef(path);
  useEffect(() => { pathRef.current = path; }, [path]);

  const load = useCallback(async () => {
    const p = pathRef.current;
    if (!p) return;
    const r = await api<T>(p);
    if (p !== pathRef.current) return;
    setLoading(false);
    if (r.ok) {
      setData(r.data); setStale(false); setError(null);
      const now = new Date().toISOString(); setAt(now); cacheSet(uid, p, r.data);
    } else if (r.error.code === "OFFLINE") {
      setStale(true);
      const c = cacheGet<T>(uid, p);
      if (c) { setData(c.data); setAt(c.at); }
      setError(r.error);
    } else {
      setError(r.error);
    }
  }, [uid]);

  useEffect(() => {
    if (!path) return;
    const c = cacheGet<T>(uid, path);
    if (c) { setData(c.data); setAt(c.at); } // eslint-disable-line react-hooks/set-state-in-effect
    load();
    let t: ReturnType<typeof setInterval> | null = null;
    const startT = () => { if (!t) t = setInterval(() => { if (document.visibilityState === "visible") load(); }, intervalMs); };
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    startT();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("online", load);
    return () => { if (t) clearInterval(t); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("online", load); };
  }, [path, intervalMs, load, uid]);

  return { data, at, stale, error, loading: loading && !data, reload: load, setData };
}
