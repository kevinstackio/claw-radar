# Production Deployment (No Staging)

This project can run in a **production-only** setup (no test/staging environment).

## 1) Local vs Production Behavior

- Dashboard/API currently read from **database only** (`netlas_hits` aggregation).
- `scripts/fetch-netlas-openclaw.mjs` still writes local backups for manual inspection, but UI path does not consume local files.

## 2) Required Production Environment Variables

At minimum:

- `NODE_ENV=production`
- `DATABASE_URL=postgresql://...` (Neon/Postgres)

For Netlas sync jobs (if run in production):

- `NETLAS_API_KEYS` (or `NETLAS_API_KEY` / `NETLAS_API_KEY_1..n`)
- `NETLAS_QUERY`
- `NETLAS_BASE_URL=https://app.netlas.io`
- `NETLAS_ENCRYPTION_KEY` (required, used to encrypt key material before storing into DB)

## 3) Production Startup

Install and build:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

Or with explicit host/port:

```bash
set HOSTNAME=0.0.0.0
set PORT=3000
pnpm start
```

## 4) One-Time Database Initialization

Run once to create/update required tables:

```bash
pnpm netlas:validate
```

This script bootstraps `docs/NEON-SCHEMA.sql` automatically before writing records.

## 5) Ongoing Data Refresh

Without a staging environment, run scheduled sync directly against production.

Recommended baseline:

- Keep top-of-hour execution (`0 * * * *` UTC, hourly)
- Control daily cost through `NETLAS_VALIDATION_MAX_KEYS`, `NETLAS_VALIDATION_MAX_PAGES`, and `NETLAS_DAILY_REQUEST_BUDGET_PER_KEY`
- Monitor API quota and Netlas key health
- If a sync fails, keep last known good dashboard data (database fallback behavior handles this)

### Project-level scheduler (Vercel Cron)

Server-side scheduling and deployment actions are managed on **Vercel only**.

This repo includes `vercel.json`:

- Cron path: `/api/cron/netlas-sync`
- Schedule: `0 * * * *` (UTC) = every hour (Asia/Shanghai, at xx:00)
- Route implementation: `app/api/cron/netlas-sync/route.ts`

Required Vercel **Environment Variables**:

- `DATABASE_URL`
- `NETLAS_API_KEYS` (or `NETLAS_API_KEY`)
- `NETLAS_ENCRYPTION_KEY`
- `CRON_SECRET` (required in production, used by `/api/cron/netlas-sync` request auth)

Optional Vercel **Environment Variables**:

- `NETLAS_QUERY`
- `NETLAS_BASE_URL`
- `NETLAS_TIMEOUT_MS`
- `NETLAS_VALIDATION_START`
- `NETLAS_VALIDATION_START_STEP` (fallback to `NETLAS_START_STEP` when empty)
- `NETLAS_VALIDATION_MAX_KEYS`
- `NETLAS_VALIDATION_MAX_PAGES`
- `NETLAS_DAILY_REQUEST_BUDGET_PER_KEY`
- `NETLAS_CRON_MAX_KEYS` (default `2`)
- `NETLAS_CRON_MAX_PAGES` (default `3`)
- `NETLAS_CRON_TIMEOUT_MS` (default `12000`)

`NETLAS_VALIDATION_MAX_KEYS` defaults to `2` (balanced mode).
`NETLAS_VALIDATION_START_STEP` controls expected page stride for validation pagination; request rows persist observed `page_size` per call for traceability.
Dictionary values are loaded from `app_dictionary` and seeded from `lib/server/runtime-dictionary.mjs`.
Dictionary design and conversion API: `docs/DICTIONARY-DESIGN.md`.

## 6) Pre-Go-Live Checklist

- `pnpm lint` passes
- `pnpm build` passes
- `DATABASE_URL` is reachable from production host
- Home page renders data and `/api/exposure/search-ip` returns expected statuses

## 7) Rollback Strategy

If production database access becomes unavailable:

1. Pause scheduled sync.
2. Restore database connectivity.
3. Re-run `pnpm netlas:validate` once (if schema drift is suspected).
4. Re-enable scheduled sync.

Use this only as a temporary emergency path.
