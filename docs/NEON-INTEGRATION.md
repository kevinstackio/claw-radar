# Neon 集成说明（ClawRadar）

## 1. 目标

本文定义 Neon（Postgres）在本项目中的用途与边界，主要用于：

- Netlas 多密钥池管理
- 日/月额度账本
- 请求级别落库与状态结算
- 同步任务运行日志
- 原始响应与命中明细全量留痕
- 同步前额度校准与冗余控制

说明：这是项目集成文档，不是注册教程。

## 2. 架构定位

Neon 负责存储“可追溯运行状态”，包括：

- 密钥状态、限额、健康度
- 请求生命周期（`pending -> ok/timeout/unknown/...`）
- 每次同步任务的计划、执行与结果
- 资产明细记录（结构化字段 + 原始 `raw_hit`）
- 额度校准快照与漂移记录

本地快照文件（`data/backups/exposure/...`）可保留用于离线核对；当前仪表盘在线路径走数据库聚合。
当前前端统计口径为“唯一公网 IP 数”，不展示重复扫描次数。

## 3. 必要环境变量

```bash
DATABASE_URL=postgresql://<role>:<password>@<host>/<db>?sslmode=require
NETLAS_ENCRYPTION_KEY=<strong-random-secret>
```

说明：`NETLAS_ENCRYPTION_KEY` 由环境变量提供，不落库明文。

## 4. 表结构分层

核心表：

- `netlas_keys`：密钥池（仅存密文，不存明文）
- `netlas_sync_jobs`：同步任务主记录
- `netlas_requests`：上游请求级明细（含响应体）
- `netlas_hits`：逐条资产记录（含 `raw_hit`）
- `netlas_snapshots`：本地快照元数据
- `netlas_key_usage_daily`：日用量
- `netlas_key_usage_monthly`：月用量
- `app_dictionary`：通用字典中心（配置、映射、转换）

校准表：

- `netlas_quota_calibrations`：每次同步前后的额度校准快照
- `netlas_quota_drift_events`：本地账本与上游额度偏差记录

## 5. “完整记录”最低字段要求

任务级：

- `job_id`、`run_type`、`query`、`base_url`、`final_status`、`started_at`、`finished_at`

请求级：

- `request_id`、`key_id`、`endpoint`、`start_offset`、`status`、`http_status`、`duration_ms`
- `response_headers`、`response_body(jsonb)`、`response_body_text`

资产级：

- `request_id`、`netlas_item_index`、`ip`、`port`、地理字段
- `raw_hit(jsonb)`（用于完整还原）

额度级：

- 每 key 的 `used_requests`、`used_coins`、`unknown_pending`
- 校准快照的 `provider_used/remaining` 与 `local_used/remaining`

## 6. 同步前校准（强制）

每次同步开始前必须执行校准步骤：

1. 拉取上游可用额度信息（能拿到多少算多少：request/coins/daily/monthly）。
2. 读取本地账本（daily/monthly 累计）。
3. 计算漂移值：`drift = provider_used - local_used`。
4. 写入 `netlas_quota_calibrations`。
5. 若漂移超过阈值（如 5% 或固定值），写入 `netlas_quota_drift_events` 并触发降速/限流保护。

## 7. 冗余策略（防止超额）

- 预算预留：每个 key 预留 10%~20% 不参与正常调度。
- 保护阈值：当估算剩余额度低于阈值时，仅允许 P0 任务。
- `unknown` 请求保护：先探针对账，再决定是否重试。
- 多 key 回退：某 key 异常时，自动降权并切换其他 key。

## 8. 安全要求

- API Key 仅存密文 `api_key_ciphertext`。
- 日志中只输出 `key_id`（如 `kf_ab12cd34...`），不输出明文凭据。
- 运行账号使用最小权限 DB role。
- 禁止把 `DATABASE_URL`、真实 key 提交到 Git。

## 9. 兼容性

- 单 key 模式继续可用。
- 配置一把 key 时，调度器退化为单 key 固定策略。
- 前端展示链路读取数据库聚合结果，不依赖本地快照文件。

## 10. 关联文档

- [NETLAS-GATEWAY-DESIGN.md](./NETLAS-GATEWAY-DESIGN.md)
- [NEON-SCHEMA.sql](./NEON-SCHEMA.sql)
- [DICTIONARY-DESIGN.md](./DICTIONARY-DESIGN.md)
