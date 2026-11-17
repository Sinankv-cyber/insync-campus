import { randomBytes, randomInt } from "node:crypto";

export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L

export function newId(prefix = ""): string {
  return prefix + randomBytes(12).toString("base64url");
}

/** Random, non-sequential 8-character typed code. */
export function newCode(): string {
  let s = "";
  for (let i = 0; i < 8; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return s;
}

export function normalizeCode(input: string): string {
  let s = String(input || "").toUpperCase().trim();
  // Accept a full join URL or prefixed QR payload.
  const m = s.match(/[?&]C=([A-Z0-9-]+)/) || s.match(/^HP[DCA]?:([A-Z0-9-]+)$/);
  if (m) s = m[1];
  return s.replace(/[^A-Z0-9]/g, "");
}

export function isWellFormedCode(code: string): boolean {
  return code.length === 8 && [...code].every((c) => CODE_ALPHABET.includes(c));
}

export const nowIso = () => new Date().toISOString();
