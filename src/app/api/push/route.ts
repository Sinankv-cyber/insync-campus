import { z } from "zod";
import { body, fail, handle, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { deliverPending, persistNotification, pushConfigured } from "@/lib/services";
import { newId, nowIso } from "@/lib/util";

const Sub = z.object({ endpoint: z.string().url().max(1000), keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }) });

export const POST = handle(async (req: Request) => {
  const u = await requireUser();
  if (!pushConfigured()) throw fail("NOT_CONFIGURED", "Web Push is not configured on this server.", 503);
  const s = await body(req, Sub);
  const db = getDb();
  await db.run(`INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at) VALUES ($1,$2,$3,$4,$5,$6)
                ON CONFLICT (endpoint) DO UPDATE SET p256dh = $4, auth = $5 WHERE push_subscriptions.user_id = $2`, [newId("ps_"), u.id, s.endpoint, s.keys.p256dh, s.keys.auth, nowIso()]);
  const nid = await db.tx((tx) => persistNotification(tx, u.id, "test", "Notifications are on", "InSync will notify you here. Delivery can be delayed by your phone or browser."));
  await deliverPending([nid]);
  const st = await db.get<{ push_status: string }>(`SELECT push_status FROM notifications WHERE id = $1`, [nid]);
  return ok({ subscribed: true, testDelivery: st?.push_status });
});

export const DELETE = handle(async (req: Request) => {
  const u = await requireUser();
  const { endpoint } = await body(req, z.object({ endpoint: z.string().max(1000) }));
  await getDb().run(`DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2`, [endpoint, u.id]);
  return ok({ subscribed: false });
});
