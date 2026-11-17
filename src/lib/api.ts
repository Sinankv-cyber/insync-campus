import "server-only";
import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";

export type ErrorCode =
  | "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "INVALID_CODE" | "EXPIRED_CODE"
  | "WRONG_PURPOSE" | "ALREADY_USED" | "ALREADY_RECEIVED" | "ALREADY_RETURNED" | "ALREADY_JOINED"
  | "NOT_ENROLLED" | "SESSION_CLOSED" | "PENDING_REMAIN" | "RATE_LIMITED" | "NO_PHONE"
  | "CONFLICT" | "NOT_CONFIGURED" | "SERVER_ERROR" | "OFFLINE";

export class ApiError extends Error {
  constructor(public code: ErrorCode, message: string, public status = 400, public extra?: Record<string, unknown>) {
    super(message);
  }
}

export const fail = (code: ErrorCode, message: string, status = 400, extra?: Record<string, unknown>) =>
  new ApiError(code, message, status, extra);

export function ok<T>(data: T, init?: number) {
  return NextResponse.json({ ok: true, data }, { status: init ?? 200, headers: { "Cache-Control": "no-store" } });
}

export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof ApiError) {
        return NextResponse.json({ ok: false, error: { code: e.code, message: e.message, ...e.extra } }, { status: e.status, headers: { "Cache-Control": "no-store" } });
      }
      if (e instanceof ZodError) {
        return NextResponse.json({ ok: false, error: { code: "VALIDATION", message: e.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ") } }, { status: 400 });
      }
      console.error("[api] unexpected", e);
      return NextResponse.json({ ok: false, error: { code: "SERVER_ERROR", message: "Something went wrong on the server. Nothing was confirmed." } }, { status: 500 });
    }
  };
}

export async function body<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let json: unknown;
  try { json = await req.json(); } catch { throw fail("VALIDATION", "Request body must be JSON"); }
  return schema.parse(json);
}

export function pageParams(url: URL) {
  const limit = Math.min(100, Math.max(1, Math.trunc(Number(url.searchParams.get("limit"))) || 25));
  const rawOffset = Math.trunc(Number(url.searchParams.get("offset")));
  const offset = Number.isFinite(rawOffset) ? Math.min(100_000, Math.max(0, rawOffset)) : 0;
  return { limit, offset };
}
