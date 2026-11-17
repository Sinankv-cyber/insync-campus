import "server-only";
import { Google } from "arctic";

export function googleClient() {
  const id = process.env.GOOGLE_CLIENT_ID, secret = process.env.GOOGLE_CLIENT_SECRET;
  const base = process.env.APP_URL || "http://localhost:3333";
  if (!id || !secret) return null;
  return new Google(id, secret, `${base}/api/auth/google/callback`);
}
