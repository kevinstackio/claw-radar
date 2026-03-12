# GitHub 定时任务配置（替代 Vercel Cron）

本文用于说明如何使用 GitHub Actions 定时触发生产环境同步，并彻底移除 Vercel Cron。
关键配置总表请以 `docs/CRITICAL-CONFIG.md` 为准。

## 0. 必配项总表（建议直接照抄）

### Vercel（Production Environment Variables）

1. `DATABASE_URL`
2. `NETLAS_API_KEYS`
3. `NETLAS_ENCRYPTION_KEY`
4. `CRON_SECRET`

### GitHub（Repository Secrets）

1. `CRON_ENDPOINT_URL`
2. `CRON_SECRET`

建议值示例：

```bash
CRON_ENDPOINT_URL=https://clawradar.kevinstack.dev/api/cron/netlas-sync
```

关键约束：

- GitHub 的 `CRON_SECRET` 必须与 Vercel 的 `CRON_SECRET` 完全一致。
- `NETLAS_ENCRYPTION_KEY` 只需要配置在 Vercel（运行时使用），不需要配置在 GitHub。
- `CRON_SECRET` 必须放在 GitHub `Secrets`，不要放在 `Variables`。

## 1. 当前定时方式

- 已移除 `vercel.json` 中的 `crons` 配置。
- 定时入口改为 GitHub Actions：
  - Workflow: `.github/workflows/netlas-sync-schedule.yml`
  - Schedule: `0 * * * *`（UTC，每小时整点）
  - 触发接口：`/api/cron/netlas-sync`

## 2. 变量与密钥

### Vercel（Production 环境变量）

1. `DATABASE_URL`
2. `NETLAS_API_KEYS`
3. `NETLAS_ENCRYPTION_KEY`
4. `CRON_SECRET`

说明：

- `NETLAS_ENCRYPTION_KEY`：用于加密存库，不可缺少。
- `CRON_SECRET`：用于 `/api/cron/netlas-sync` 鉴权，建议强随机值。

### GitHub（Repository Secrets）

1. `CRON_ENDPOINT_URL`
- 例如：`https://<your-domain>/api/cron/netlas-sync`

2. `CRON_SECRET`
- 值必须与 Vercel `CRON_SECRET` 完全一致。

## 3. GitHub 配置步骤

1. 打开仓库 `Settings -> Secrets and variables -> Actions`。
2. 在 `Secrets` 下新增上述两个 Repository Secrets（不要建到 `Variables`）。
3. 打开 `Actions` 页面，确认 `Netlas Scheduled Sync` workflow 已启用。
4. 确认仓库默认分支是 `main`（`schedule` 只在默认分支运行）。
5. 在 workflow 页面先点一次 `Run workflow` 做人工验证。

## 4. 如何删除 Vercel 控制台 Cron

Vercel Cron 来自代码配置，不能只在控制台“手工删干净”。正确方式：

1. 保持仓库中没有 `vercel.json` 的 `crons`（本仓库已完成）。
2. 在 Vercel 对应项目执行一次新的 Production 部署。
3. 部署完成后到 `Settings -> Cron Jobs` 刷新，旧任务会消失。

如果还显示旧任务，通常是你看的不是最新 Production 部署，或不是这个仓库绑定的项目。

## 5. 常见问题

1. `500 cron_secret_required`
- Vercel 缺少 `CRON_SECRET`，或改完变量后未重新部署。

2. `401 unauthorized`
- GitHub `CRON_SECRET` 与 Vercel `CRON_SECRET` 不一致。

3. `500 Missing required env: NETLAS_ENCRYPTION_KEY`
- Vercel 缺少 `NETLAS_ENCRYPTION_KEY`，或改完变量后未重新部署。

4. workflow 不按时触发
- 仓库默认分支不是 `main`；
- Actions 被手动禁用；
- GitHub `schedule` 本身可能有分钟级延迟（正常现象）。

5. 任务执行了但数据总数不变
- 可能是 `updated > 0` 且 `inserted = 0`，表示更新了已有 IP 记录但没有新增 IP。
