/**
 * Schedule maths: timestamps are UTC; schedules are evaluated in the policy timezone
 * (default Asia/Kolkata). Handles windows that cross midnight (e.g. 22:00 -> 01:00).
 */
export type PolicyTimes = { use_start: string; use_end: string; grace_minutes: number; timezone: string };

function tzOffsetMinutes(at: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone, hour12: false, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p = Object.fromEntries(dtf.formatToParts(at).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** Local wall-clock date (YYYY-MM-DD) + HH:MM in tz -> UTC Date. */
export function zonedToUtc(date: string, hhmm: string, timeZone: string): Date {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let off = tzOffsetMinutes(new Date(guess), timeZone);
  let t = guess - off * 60000;
  const off2 = tzOffsetMinutes(new Date(t), timeZone);
  if (off2 !== off) { off = off2; t = guess - off * 60000; }
  return new Date(t);
}

export function localDate(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

export function cycleBounds(date: string, p: PolicyTimes) {
  const windowStart = zonedToUtc(date, p.use_start, p.timezone);
  const endDate = p.use_end <= p.use_start ? addDays(date, 1) : date; // crosses midnight
  const windowEnd = zonedToUtc(endDate, p.use_end, p.timezone);
  const deadline = new Date(windowEnd.getTime() + p.grace_minutes * 60000);
  return { windowStart, windowEnd, deadline };
}

/**
 * The cycle a student is "in" right now: yesterday's cycle if its deadline has not yet
 * passed (window crossing midnight), otherwise today's.
 */
export function currentCycleDate(now: Date, p: PolicyTimes): string {
  const today = localDate(now, p.timezone);
  const yesterday = addDays(today, -1);
  if (now < cycleBounds(yesterday, p).deadline) return yesterday;
  return today;
}

export function isValidHHMM(s: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

export function isValidTimeZone(tz: string) {
  try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; }
}
