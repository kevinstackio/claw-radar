# Production Deployment (No Staging)

This project can run in a **production-only** setup (no test/staging environment).

## 1) Local vs Production Behavior

- Local debug (`NODE_ENV=development` + `EXPOSURE_DATA_SOURCE=auto`):
  - Priority: local backup files -> database
  - Useful for fast iteration without mandatory cloud dependencies
- Production (`NODE_ENV=production` + `EXPOSURE_DATA_SOURCE=auto`):
  - Priority: database -> local backup files
  - Prevents production from silently depending on local debug files

Data source override:

- `EXPOSURE_DATA_SOURCE=database`: force database only
- `EXPOSURE_DATA_SOURCE=local`: force local file only
- `EXPOSURE_DATA_SOURCE=auto`: environment-aware fallback order (recommended)

## 2) Required Production Environment Variables

At minimum:

- `NODE_ENV=production`
- `EXPOSURE_DATA_SOURCE=database`
- `DATABASE_URL=postgresql://...` (Neon/Postgres)

For Netlas sync jobs (if run in production):

- `NETLAS_API_KEYS` (or `NETLAS_API_KEY` / `NETLAS_API_KEY_1..n`)
- `NETLAS_QUERY`
- `NETLAS_BASE_URL=https://app.netlas.io`
- Encryption key is read from database dictionary path `netlas.secrets.encryption_key`

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

- Keep a low frequency (for example every 24-48 hours)
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
- `CRON_SECRET` (recommended, used by Vercel Cron request auth)

Optional Vercel **Environment Variables**:

- `NETLAS_QUERY`
- `NETLAS_BASE_URL`
- `NETLAS_TIMEOUT_MS`
- `NETLAS_VALIDATION_START`
- `NETLAS_VALIDATION_MAX_KEYS`
- `NETLAS_VALIDATION_MAX_PAGES`
- `NETLAS_DAILY_REQUEST_BUDGET_PER_KEY`

`NETLAS_VALIDATION_MAX_KEYS` defaults to `2` (balanced mode).
Dictionary values are loaded from `app_dictionary` and seeded from `lib/server/runtime-dictionary.mjs`.
Dictionary design and conversion API: `docs/DICTIONARY-DESIGN.md`.

## 6) Pre-Go-Live Checklist

- `pnpm lint` passes
- `pnpm build` passes
- `DATABASE_URL` is reachable from production host
- `EXPOSURE_DATA_SOURCE=database` is set in production
- Home page renders data and `/api/exposure/search-ip` returns expected statuses

## 7) Rollback Strategy

If production database access becomes unavailable:

1. Temporarily switch to `EXPOSURE_DATA_SOURCE=local`
2. Keep serving last valid local snapshot
3. Restore database connectivity
4. Switch back to `EXPOSURE_DATA_SOURCE=database`

Use this only as a temporary emergency path.

