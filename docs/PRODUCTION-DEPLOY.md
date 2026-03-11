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
- `NETLAS_ENCRYPTION_KEY`

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
