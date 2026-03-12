# Vercel 定时任务配置（整点执行）

本文用于明确 ClawRadar 在 Vercel 上的整点同步配置、必需变量、常见故障排查。

## 1. 整点配置

仓库中的 `vercel.json` 已配置为：

```json
{
  "crons": [
    {
      "path": "/api/cron/netlas-sync",
      "schedule": "0 * * * *"
    }
  ]
}
```

说明：

- `0 * * * *` 表示 **每个整点（UTC）** 执行一次。
- 北京时间（Asia/Shanghai）会在每天 `08:00~23:00 + 次日 00:00~07:00` 对应 UTC 整点触发。

## 2. 套餐限制（必须先确认）

截至 2026-03-12：

- Hobby：仅支持较低频（通常每天最多 1 次）。
- Pro / Enterprise：支持小时级等更高频率。

如果你是 Hobby，`0 * * * *` 不会按小时生效。

## 3. 必配环境变量（Production）

在 Vercel 项目设置中，至少配置：

1. `DATABASE_URL`
- Neon 数据库连接串。

2. `NETLAS_API_KEYS`
- Netlas key 列表，逗号分隔，例如：`key1,key2,key3`。

3. `NETLAS_ENCRYPTION_KEY`
- 用于加密写入数据库的 key 材料（`api_key_ciphertext`）。
- 这是应用层加密密钥，不是 Netlas key。

4. `CRON_SECRET`
- Cron 路由鉴权密钥。
- 缺失时，`/api/cron/netlas-sync` 会直接拒绝执行。

建议额外配置（用于稳定时长）：

- `NETLAS_CRON_MAX_KEYS=2`
- `NETLAS_CRON_MAX_PAGES=3`
- `NETLAS_CRON_TIMEOUT_MS=12000`

## 4. 变量建议值生成

生成 `NETLAS_ENCRYPTION_KEY` / `CRON_SECRET`（任选一种方式）：

```bash
openssl rand -hex 32
```

或：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

建议：

- 长度至少 32 字节随机值（hex 长度 64）。
- 不要在仓库、issue、日志里明文暴露。

## 5. Vercel 实际配置步骤

1. 打开 Vercel 项目 `Settings -> Environment Variables`。
2. 把上述变量全部加到 `Production`。
3. 确认 `Settings -> Cron Jobs` 中存在 `/api/cron/netlas-sync` 且 schedule 为 `0 * * * *`。
4. 重新部署一次 Production（让新变量生效）。

## 6. 快速自检

1. 看函数日志是否每小时出现 `/api/cron/netlas-sync`。
2. 看数据库 `netlas_sync_jobs` 是否新增 `run_type='scheduled'` 记录。
3. 若总条数不变，再看 `summary.inserted` / `summary.updated`：
- `inserted=0, updated>0`：是已有目标重复命中，总数不涨但数据是有更新的。
- `planned_requests=0`：预算已耗尽或被调度限制。
- `stop_reason=no_available_key`：可用 key 都不可用（额度/网络/状态问题）。

## 7. 常见报错对照

1. `cron_secret_required`
- 原因：没配 `CRON_SECRET`。
- 处理：补变量并重新部署。

2. `Missing required env: NETLAS_ENCRYPTION_KEY`
- 原因：没配 `NETLAS_ENCRYPTION_KEY`。
- 处理：补变量并重新部署。

3. `NETWORK_ERROR`
- 原因：调用 Netlas 网络失败（瞬时或上游问题）。
- 处理：先看同时间段是否有 `ok` 请求；必要时减小 `NETLAS_CRON_MAX_KEYS/MAX_PAGES`，降低单次压力。
