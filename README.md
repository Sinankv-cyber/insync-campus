# InSync.

**Everything in sync.**

InSync is an installable web app (PWA) for a residential college. It handles two jobs. The first is class attendance: students check in by scanning a QR code or typing a short code, and the teacher confirms each check-in. The second is scheduled phone deposit and collection: each evening a student hands their phone in and picks it up later, and a warden confirms each handover and issues a receipt. **InSync cannot monitor, track or lock phones.** It only records custody that a staff member has confirmed: who handed which phone to whom, when, and which slot it went into.

## Demo accounts

All of these accounts are seeded synthetic development data. Every one uses the password `InSync@2026`.

| Role | Email | Notes |
|---|---|---|
| Admin | admin@insync.test | Policy, staff accounts, demo deadline |
| Teacher | priya@insync.test | Data Structures, class code `CS2K-RM7P` |
| Teacher | joseph@insync.test | Engineering Maths, class code `MA2Q-HT9W` |
| Warden | warden@insync.test | Confirms deposits and collections |
| Student | ameen@insync.test | Roll H024, Room 12, Slot B-12 |
| Student | fathima@insync.test | |
| Student | arjun@insync.test | |
| Student | riya@insync.test | Has an approved exception |

## Run locally

The `db:*` scripts read `.env.local`. Start by copying `.env.example` to `.env.local` and filling it in.

```bash
npm install
npm run db:migrate
npm run db:seed
npm run dev        # http://localhost:3333
```

## Data modes

- `STORAGE_DRIVER=neon` stores data in Neon Postgres via `DATABASE_URL`. Use this for deployments.
- `STORAGE_DRIVER=sqlite` stores data in a local demo file, `.data/hostelpass.sqlite` (you can change the path with `SQLITE_PATH`). It runs on a local server only and needs Node 22.5 or newer. You have to choose it explicitly. The app never fails over to SQLite automatically.

## Environment variables

Put the values in `.env.local` locally and in the Vercel project settings when deployed. Never commit them.

| Name | Purpose |
|---|---|
| `DATABASE_URL` | Neon Postgres connection string |
| `STORAGE_DRIVER` | `neon` or `sqlite` |
| `AUTH_SECRET` | Session secret, 32+ characters |
| `APP_URL` | Public base URL, e.g. `http://localhost:3333` |
| `CRON_SECRET` | Protects `/api/cron/evaluate` |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web push. Generate the keys with `npx web-push generate-vapid-keys` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google sign-in |
| `SQLITE_PATH` | Optional. Overrides the SQLite file path |

## Google sign-in

- In Google Cloud Console, add `<APP_URL>/api/auth/google/callback` as an authorized redirect URI.
- Anyone who signs in with Google for the first time becomes a **student**. They join a class by entering the teacher's class code, and the teacher approves the request.
- Staff accounts (teacher, warden, admin) can only be created by an admin.

## Deploy to Vercel

1. Set all the environment variables above in the Vercel project, with `STORAGE_DRIVER=neon`.
2. Run `npm run db:migrate && npm run db:seed` once against the Neon database, with `.env.local` pointing at it.
3. Vercel Cron calls `/api/cron/evaluate` as configured in `vercel.json`. When `CRON_SECRET` is set, Vercel sends `Authorization: Bearer $CRON_SECRET` automatically.

Hobby plans only allow a daily cron job. For that reason, the app also reconciles overdue deposits every time a warden or admin dashboard refreshes. Locally, `src/instrumentation.ts` runs the same check every 60 seconds.

## Testing on a phone

- The camera only works over HTTPS. Use the deployed URL, not a LAN `http://` address.
- **Android (Chrome):** menu, then **Install app**.
- **iPhone (Safari):** Share, then **Add to Home Screen**. On iOS, push notifications only work in the Home Screen app, and only on iOS 16.4 or later.

## Demo script

1. **QR attendance:** Priya opens a session and shows its QR code. Ameen scans it, Priya confirms, and Ameen sees the result.
2. **Typed deposit code:** with the camera unavailable, Ameen types his deposit code instead. The warden confirms the deposit and Ameen gets a receipt (Slot B-12).
3. **Overdue alert:** as Admin, choose **Short demo deadline** and let it pass. An overdue alert appears for the warden, and confirming the handover resolves it.
4. **Collection by ID lookup:** the warden finds a student by roll number (e.g. H024) and confirms the phone was returned.
5. **Edge cases:** an expired code and a replayed code are both rejected, duplicate check-ins are blocked, another role's pages are refused, and the app shows its offline state.

## Checks

```bash
node scripts/acceptance.mjs [baseUrl]
npx tsx --conditions=react-server scripts/schedule-test.ts
```
