/* InSync service worker: caches the application shell only. API responses are never cached here
   (per-user last-known data lives in localStorage and is cleared on sign-out). */
const SHELL = "insync-shell-v2";
const PRECACHE = ["/", "/login", "/today", "/attendance", "/history", "/profile", "/offline.html", "/manifest.webmanifest", "/brand/mark.svg", "/brand-icon/192"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => Promise.allSettled(PRECACHE.map((u) => c.add(new Request(u, { cache: "reload" }))))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then((res) => { const copy = res.clone(); if (res.ok) caches.open(SHELL).then((c) => c.put(req, copy)); return res; })
      .catch(async () => (await caches.match(req)) || (await caches.match("/offline.html"))));
    return;
  }
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/brand")) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { const copy = res.clone(); if (res.ok) caches.open(SHELL).then((c) => c.put(req, copy)); return res; })));
  }
});
self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "CLEAR_USER_DATA") { /* no user data is cached by the SW */ }
});
self.addEventListener("push", (e) => {
  let d = { title: "InSync", body: "" };
  try { d = e.data.json(); } catch {}
  e.waitUntil(self.registration.showNotification(d.title || "InSync", { body: d.body, icon: "/brand-icon/192", badge: "/brand-icon/192" }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window" }).then((cs) => (cs[0] ? cs[0].focus() : self.clients.openWindow("/"))));
});
