# 关键配置总览（Single Source of Truth）

本文是 ClawRadar 生产同步链路的关键配置总表，用于后续排障和回看。

适用范围：

- 调度方式：GitHub Actions `schedule`
- 触发入口：`GET /api/cron/netlas-sync`
- 部署平台：Vercel

## 1. 调度链路

1. GitHub Actions 按 cron 触发 `.github/workflows/netlas-sync-schedule.yml`
2. Workflow 调用 `CRON_ENDPOINT_URL`
3. 路由 `app/api/cron/netlas-sync/route.ts` 校验 `Authorization: Bearer <CRON_SECRET>`
4. 通过 `scripts/validate-netlas-neon.mjs` 拉取 Netlas 并写入 Neon

## 2. 必配项总表

### Vercel（Production Environment Variables）

1. `DATABASE_URL`
- 作用：Neon/Postgres 连接
- 缺失表现：数据库连接相关错误

2. `NETLAS_API_KEYS`
- 作用：Netlas API 访问密钥（逗号分隔）
- 缺失表现：`Missing Netlas API keys...`

3. `NETLAS_ENCRYPTION_KEY`
- 作用：加密存储 key 材料（`api_key_ciphertext`）
- 缺失表现：`Missing required env: NETLAS_ENCRYPTION_KEY`

4. `CRON_SECRET`
- 作用：cron 路由鉴权密钥
- 缺失表现：`cron_secret_required`

### GitHub（Repository Secrets）

1. `CRON_ENDPOINT_URL`
- 示例：`https://clawradar.kevinstack.dev/api/cron/netlas-sync`

2. `CRON_SECRET`
- 必须与 Vercel `CRON_SECRET` 完全一致
- 注意：必须放在 `Secrets`，不要放在 `Variables`

## 3. 建议项（可选）

以下用于控制单次任务时长和请求压力（Vercel env）：

- `NETLAS_CRON_MAX_KEYS=2`
- `NETLAS_CRON_MAX_PAGES=3`
- `NETLAS_CRON_TIMEOUT_MS=12000`

## 4. 一次性验收清单

1. GitHub `Actions` 中 `Netlas Scheduled Sync` 可手动 `Run workflow`
2. Workflow 日志返回 HTTP 2xx
3. Vercel Function 日志出现 `/api/cron/netlas-sync` 调用记录
4. 数据库 `netlas_sync_jobs` 出现新的 `run_type='scheduled'` 记录

## 5. 常见报错对照

1. `500 cron_secret_required`
- 原因：Vercel 未配置 `CRON_SECRET` 或变量改后未重部署

2. `401 unauthorized`
- 原因：GitHub `CRON_SECRET` 与 Vercel 不一致

3. `500 Missing required env: NETLAS_ENCRYPTION_KEY`
- 原因：Vercel 缺少 `NETLAS_ENCRYPTION_KEY` 或变量改后未重部署

4. `bind message supplies ... parameters ... requires ...`
- 原因：服务端仍在旧部署版本
- 处理：确保 Production 部署到最新 commit 后重试

## 6. 变更纪律

涉及以下任一项变更时，必须同步更新本文：

- 调度频率（workflow cron）
- `CRON_ENDPOINT_URL` 路径
- 必配变量/密钥集合
- 鉴权策略
