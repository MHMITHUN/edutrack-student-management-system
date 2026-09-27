# Deployment Guide

EduTrack deploys to **Vercel in two modes**: zero-env Demo mode (no database,
data resets per instance) or Persistent mode (MongoDB Atlas). Both use the
same build — the store picks its implementation from the presence of
`MONGODB_URI`.

## 1. GitHub connection

1. Push the repository to GitHub (no secrets in the repo; `.env` is
   gitignored — the README never tells anyone to commit real credentials).
2. In Vercel: **Add New → Project → Import Git Repository**, pick the repo.
3. Framework preset **Next.js** is detected automatically. Build command
   `next build`, output handled by Vercel — no overrides needed.

## 2. Demo mode (zero environment variables)

Deploy with **no environment variables at all**:

- The app runs on the in-memory DemoStore, which seeds itself lazily on
  first request (1 admin, 6 teachers, 60 students, 33 mark sheets, 344
  attendance records, 70 audit rows).
- Data resets when the serverless instance recycles — every page carries the
  demo-mode banner, so this is labeled honestly, never hidden.
- Set `SESSION_SECRET` anyway (step 3): without it the HMAC key falls back
  to a public demo constant, which is fine for a demo but should not ship.

## 3. Environment variables (Vercel → Project → Settings → Environment Variables)

| Variable          | Demo mode        | Persistent mode        |
| ----------------- | ---------------- | ---------------------- |
| `SESSION_SECRET`  | recommended      | **required**           |
| `MONGODB_URI`     | leave unset      | **required**           |
| `MONGODB_DB_NAME` | `edutrack_sms` (default) | optional, e.g. `edutrack_prod` |

Generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Secrets live only in Vercel's env store (or `.env.local` locally) — never in
the repository.

## 4. Database setup (persistent mode)

1. Create a free cluster on **MongoDB Atlas** (M0 is enough for a demo).
2. Create a database user, allow network access from Vercel
   (`0.0.0.0/0` or Vercel's IP ranges), and copy the connection string into
   `MONGODB_URI`.
3. Seed it once (idempotent — re-running only inserts what is missing, it
   never overwrites changes):

   ```bash
   # from a machine with the repo checked out
   MONGODB_URI="<your-connection-string>" npm run seed
   ```

   The seed ensures all indexes (mirroring `MongoStore.ensureIndexes`) and
   writes every base collection with `$setOnInsert`, then prints per-
   collection counts. Alternatively, boot the app once against the database —
   `MongoStore.create()` creates the same indexes; the seed script exists so
   you can populate without starting the app.

## 5. Build configuration

- Node.js 22+ (Vercel default is fine; `engines.node` enforces it).
- No custom build settings; `next build` runs typecheck-adjacent page-data
  generation, and lint/typecheck gates are in the repo's scripts.
- Dev port 3003 is a local convention only (`npm run dev`); Vercel ignores
  it.

## 6. Production smoke test

After the first deploy, run through this list with the demo accounts
(password `Demo@12345`):

1. Open the deployment URL → redirected to `/login` (no public pages).
2. Sign in `student@demo.local` → dashboard shows a computed GPA and
   attendance percentage; open Results → printable marksheet renders with a
   verification ID.
3. Sign in `teacher@demo.local` → Marks Entry → roster loads → save a draft.
4. Sign in `admin@demo.local` → Marks Review → a submitted sheet is in the
   queue → publish it.
5. Audit Log → the `marksheet.publish` row from step 4 is listed.
6. (Persistent mode) Re-run `npm run seed` output shows `already present`
   counts — proving idempotency.

## 7. Rollback guidance

- **Vercel → Deployments → previous deployment → … → Promote to Production**
  restores the previous build instantly (env-var mistakes included — check
  which env vars changed around the bad deploy).
- Data rollback is **not** automatic: MongoDB Atlas keeps continuous cloud
  backups on paid tiers; on M0, re-run `npm run seed` to restore the base
  demo dataset (user-entered data is not recoverable on the free tier).
- A bad settings change (grade bands) can be reverted from `/admin/settings`
  itself; the audit log records previous + new bands for every change.

## 8. Demo credentials

Published in the README: `admin@demo.local`, `teacher@demo.local`,
`student@demo.local` (plus `shamima.akter@demo.local`,
`tanvir.ahmed@demo.local`, `payel.sen@std.demo.local`) — all with password
`Demo@12345`. Obviously fictional accounts; never reuse real credentials.
