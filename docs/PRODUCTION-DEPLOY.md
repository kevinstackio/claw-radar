# Production Deployment (No Staging)

This project can run in a **production-only** setup (no test/staging environment).

## 1) Runtime Behavior

- Dashboard/API currently read from **database only** (`netlas_instances` aggregation).
- `scripts/fetch-netlas-openclaw.mjs` still writes local backups for manual inspection, but UI path does not consume local files.

## 2) Required Production Environment Variables

At minimum:

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

- Keep stable execution cadence (current workflow default: `0 * * * *` UTC, hourly at top-of-hour)
- Control daily cost through `NETLAS_VALIDATION_MAX_KEYS`, `NETLAS_VALIDATION_MAX_PAGES`, and `NETLAS_DAILY_REQUEST_BUDGET_PER_KEY`
- Monitor API quota and Netlas key health
- If a sync fails, keep last known good dashboard data (database fallback behavior handles this)

### Project-level scheduler (GitHub Actions)

Server-side scheduling is managed by **GitHub Actions schedule**.

Workflow file:

- `.github/workflows/netlas-sync-schedule.yml`
- Calls `/api/cron/netlas-sync` on production URL every top-of-hour (UTC)

Required Vercel **Environment Variables**:

- `DATABASE_URL`
- `NETLAS_API_KEYS` (or `NETLAS_API_KEY`)
- `NETLAS_ENCRYPTION_KEY`
- `CRON_SECRET` (required in production, used by `/api/cron/netlas-sync` request auth)

Required GitHub **Repository Secrets**:

- `CRON_ENDPOINT_URL` (example: `https://<your-production-domain>/api/cron/netlas-sync`)
- `CRON_SECRET` (must match Vercel `CRON_SECRET`)

Critical configuration snapshot:

- Vercel Production env:
  - `DATABASE_URL`
  - `NETLAS_API_KEYS`
  - `NETLAS_ENCRYPTION_KEY`
  - `CRON_SECRET`
- GitHub Actions secrets:
  - `CRON_ENDPOINT_URL`
  - `CRON_SECRET` (same value as Vercel)

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
GitHub scheduler setup and troubleshooting: `docs/GITHUB-CRON-SETUP.md`.

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
