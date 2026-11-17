# Progress — InSync

## Start here
- Root: this folder (not a git repo yet). Stack: Next.js 16.4 (App Router, Turbopack), TypeScript, Tailwind v4, `pg` → Neon, `node:sqlite` local demo mode, iron-session + bcryptjs, arctic (Google OAuth), qrcode/jsQR, web-push.
- Implementation started 2026-11-17 ~20:32 IST. Event clock: actual event start not recorded — ask/record. Feature freeze at event minute 195.
- Preview: `npm run dev` → http://localhost:3333 (launch config `.claude/launch.json`, name `hostelpass`).
- Data: Neon project `hostelpass` (ap-southeast-1); app brand is InSync., `STORAGE_DRIVER=neon`. Env names only: `DATABASE_URL, STORAGE_DRIVER, AUTH_SECRET, APP_URL, CRON_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET` (+ optional `SQLITE_PATH`).

## Product focus
USP: one auditable chain — student joins (QR or same typed code) → teacher confirms presence → warden confirms the registered phone → overdue alert resolves on confirmed custody. Scans never confirm anything by themselves.

## Verified (2026-11-17, against Neon, dev server)
- `node scripts/acceptance.mjs` → 45/45 PASS: role denials (anon/student/teacher/warden), QR≡code, pending-until-teacher, duplicate/concurrent join, non-enrolled, finalize gating + auto-absent, ID-lookup collection, demo deadline → real alert (idempotent) → typed-code deposit → concurrent confirm = 1 receipt → alert resolved, replay/wrong-purpose/expired/revoked passes, rate limit, audit, list cap 100.
- `npx tsx --conditions=react-server scripts/schedule-test.ts` → 10/10 PASS (Asia/Kolkata, midnight-crossing windows, year boundary).
- Real 21:05 IST deadline produced 18 genuine overdue alerts (1 deposited, 1 exempt).
- UI rendered: sign-in, Student Today (desktop + 360 px, no horizontal scroll), Teacher session (QR/code, pending with face badges, bulk accept), Warden Today counts.

## Not verified yet
Real phone camera scan, face detection on device, Android/iPhone install, Web Push delivery to a device, Google OAuth round-trip (redirect URI must be added in Google Cloud Console), production deployment, SQLite mode end-to-end.

## Key files
- Schema/migrations `src/lib/migrations.ts`; seed `src/lib/seed.ts`; repository `src/lib/db.ts`.
- Domain: `src/lib/services.ts` (credentials, cycles, overdue evaluation, notifications), `custody.ts`, `attendance.ts`, `warden.ts`, `schedule.ts`.
- APIs `src/app/api/**`; screens `src/app/(student)/*`, `src/app/(staff)/{teacher,warden,admin}`.
- Scheduler: `src/instrumentation.ts` (local 60 s) / `/api/cron/evaluate` (Bearer CRON_SECRET) / staff-refresh reconciliation.

## Capacity
Sized for one college (hundreds of students). Lists capped 25 default / 100 max; warden roster computes custody for ≤2000 students in 5 queries. NOT MEASURED under load.

## Also done
- `next build` passes. SQLite mode (`STORAGE_DRIVER=sqlite`, prod server on :3335) acceptance 44/45 → fixed the warden alert-inbox cap (open and resolved alerts now separate queries); re-run pending.
- Authorization source audit: no material bypass; hardened paging ints, pass-less return now needs id_lookup + note, push subscription can't be re-owned, reopen returns 409.
- README.md, .env.example, vercel.json (daily cron 16:00 UTC) written.

## Blocked
HTTPS phone preview: Vercel CLI not logged in; Vercel connector can't take the ~630 KB inline upload. Needs `npx vercel login` by the user, or approval for a public tunnel.

## NEXT
HTTPS deploy → real-device camera/install/push checks → demo rehearsal.
