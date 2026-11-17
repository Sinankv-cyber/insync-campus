import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { generateCodeVerifier, generateState } from "arctic";
import { googleClient } from "@/lib/google";

export async function GET() {
  const g = googleClient();
  if (!g) return NextResponse.redirect(new URL("/login?error=google_not_configured", process.env.APP_URL || "http://localhost:3333"));
  const state = generateState();
  const verifier = generateCodeVerifier();
  const url = g.createAuthorizationURL(state, verifier, ["openid", "profile", "email"]);
  url.searchParams.set("prompt", "select_account");
  const jar = await cookies();
  const opts = { httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: 600, secure: (process.env.APP_URL || "").startsWith("https://") };
  jar.set("g_state", state, opts);
  jar.set("g_verifier", verifier, opts);
  return NextResponse.redirect(url);
}
