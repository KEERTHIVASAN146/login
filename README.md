# Phantasm Register Lite

A small, standalone participant registration site. It's a **separate app**
from the main Phantasm project, but it reads and writes the **same
PostgreSQL database and schema** — so registrations made here show up
alongside the ones from the main site.

Collects:
- Name
- College
- Email **(required)**
- Phone
- Events (multi-select, pulled from the same event catalogue) — for **team events**, the form also collects each teammate's **name, email, and phone**, respecting each event's min/max team size

## Unique registration ID

Every successful submission gets a random ID like `PHR-284913`. Before
inserting, the server explicitly checks the database for that ID
(`SELECT ... WHERE phantasm_id = ...`); if it's already taken, it generates
another and checks again, up to 8 tries. Only once a free ID is confirmed
does it insert the registration — stored in the `phantasm_id` column, which
is also `UNIQUE` in the schema as a safety net for simultaneous submissions.
The ID is returned to the browser as the participant's reference number.

## Team events

Events marked `type: "team"` in `src/events.js` (e.g. InnoSphere, DataLens,
Quest.exe, ZoneIn, BidPro, MindWar) show an extra panel on the form once
selected, where the registrant can name their team and add teammates — each
needing a name, email, and phone. The registrant themself always counts as
one member; the form enforces each event's `minSize`/`maxSize` (including
the registrant) before allowing submission. All of it lands in the shared
`participants` table, one row per member per event, exactly like the main
site's schema expects.

## Using a Supabase database

Supabase is just managed PostgreSQL, so this connects the same way as any
other Postgres host:

1. In your Supabase project, go to **Project Settings → Database** and copy
   a connection string. For a long-running Node server like this one, use
   the **direct connection** (port `5432`), not the pgbouncer/transaction
   pooler (port `6543`) — the pooler can cause issues with prepared
   statements. If your host only allows outbound pooled connections, the
   session pooler (port `5432` on `pooler.supabase.com`) also works.
2. Set in `.env` (or your host's environment variables):
   ```
   DATABASE_URL=postgresql://postgres:<your-password>@<project-ref>.supabase.co:5432/postgres
   PGSSL=true
   ```
   Supabase requires SSL, so `PGSSL=true` is required.
3. Run `npm run migrate` once to make sure the shared tables exist (it's
   `CREATE TABLE IF NOT EXISTS`, so if your main site already created them,
   this is a no-op).
4. Point your **main** Phantasm backend at the same `DATABASE_URL` and both
   sites will read/write the same `registrations` / `event_entries` /
   `participants` tables in Supabase.

## How it connects to the same database

The main site's schema (`registrations`, `event_entries`, `participants`,
etc.) is copied as-is into `db/schema.sql` here — nothing was changed. Point
this app's `DATABASE_URL` (or `PGHOST`/`PGUSER`/`PGPASSWORD`/`PGDATABASE`) at
the exact same Postgres instance/database the main backend uses, and every
registration submitted here lands in the same tables.

If the database doesn't have the schema applied yet, run:

```bash
npm run migrate
```

This is safe to run even if the tables already exist (`CREATE TABLE IF NOT
EXISTS`), so it won't touch existing data.

## Local development

Two options — either works:

**Using the Vercel CLI (closest to production: static files + `/api` function):**
```bash
npm install -g vercel   # or use npx vercel dev, no global install needed
npm install
cp .env.example .env    # fill in DATABASE_URL / PG* vars, pointing at the shared DB
npm run migrate         # only needed once, or if the schema hasn't been applied yet
npm run dev              # runs `vercel dev`
```

**Plain Node (no Vercel CLI needed), using the Express server directly:**
```bash
npm install
cp .env.example .env
npm run migrate
npm run start:local     # node --watch server.js
```

Either way, visit:
- `http://localhost:3000/` (Vercel CLI) or `http://localhost:4100/` (plain Node) — the registration form
- `.../admin.html` — a simple admin view (enter the `ADMIN_KEY` you set in `.env`)

## Deploying to Vercel

This is a zero-config Vercel project: a static frontend at the project root
and one serverless function (`api/index.js`) that runs the whole Express API.
`vercel.json` rewrites every `/api/*` request to that function, since the
Express app itself does its own internal routing for `/api/events`,
`/api/register`, `/api/admin/*`, etc.

1. Push this folder as its own GitHub repo.
2. On [Vercel](https://vercel.com), click **Add New → Project** and import
   that repo. No build command or output directory is needed — leave the
   framework preset as "Other".
3. Under **Environment Variables**, add:
   - `DATABASE_URL` — same value as the main backend's `DATABASE_URL`, ideally
     a pooled/serverless-friendly connection string (Neon, Supabase, or
     Vercel Postgres all give you one)
   - `PGSSL` — `true` if your DB requires SSL (most managed Postgres does)
   - `PG_POOL_MAX` — optional, defaults to `5`
   - `ADMIN_KEY` — a password of your choosing, used to view `/admin.html`
   - `CORS_ORIGIN` — usually leave blank; the frontend and API share one
     domain on Vercel, so CORS isn't needed
4. Deploy. If the shared tables don't exist yet in that database, run
   `npm run migrate` once from your machine with `DATABASE_URL` pointed at
   it (pull the value with `vercel env pull` first, or copy it from the
   Vercel dashboard).

You can also still run it as a single always-on Node server (Railway,
Fly.io, etc.) with `npm start`, which uses `server.js` and serves the static
files itself — `api/index.js` is only used by Vercel.

## API

| Method | Route                      | Notes                                            |
|--------|----------------------------|---------------------------------------------------|
| GET    | `/api/events`              | List of events (with type, category, minSize, maxSize) for the form |
| POST   | `/api/register`            | `{ name, college, email, phone, events: [{eventId} or {eventId, teamName, members:[{name,email,phone}]}] }` — only `email` is required |
| GET    | `/api/admin/registrations` | Requires header `X-Admin-Key`; lists all registrations |
| GET    | `/api/admin/export.csv`    | Requires header `X-Admin-Key`; downloads a CSV     |

## Project structure

```
phantasm-register-lite/
├─ api/
│  └─ index.js         # Vercel serverless entry — just re-exports the Express app
├─ src/
│  ├─ app.js           # Express app + all /api routes (used by both api/index.js and server.js)
│  ├─ db.js            # Postgres pool (same env-var contract as the main backend)
│  ├─ events.js        # Event catalogue, mirrored from the main site
│  ├─ id.js            # Registration ID generator (PHR-XXXXXX, distinct prefix)
│  └─ migrate.js       # Applies db/schema.sql
├─ db/schema.sql        # Identical schema to the main Phantasm backend
├─ index.html / style.css / script.js   # registration form (served as static files by Vercel)
├─ admin.html / admin.js                # admin view + CSV export
├─ server.js            # Local/plain-Node dev server only — not used on Vercel
├─ vercel.json          # Rewrites /api/* to the single api/index.js function
├─ .env.example
└─ package.json
```

## Notes

- Each registration here does **not** collect payment — `payment_status` is
  stored as `pending` and `total_amount` as `0`, since this site is only for
  collecting participant details. Update `src/app.js` if you want it to also
  price events or accept payment.
- Event IDs/names/categories in `src/events.js` are mirrored from the main
  site's `backend/src/data/events.js`. Keep them in sync if the main site's
  event list changes.
