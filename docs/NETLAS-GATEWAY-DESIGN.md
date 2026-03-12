# Netlas 网关设计（多密钥 + 每日一次同步）

## 1. 设计目标

构建统一 Netlas 网关，满足：

- 业务侧无感知�? �?key 和多�?key 用同一套接�?
- 每天定时同步 1 次，但同步量动态调�?
- 不超额、不打爆、不断更
- �?`402/429/504/超时/未知` 有统一语义
- 同步前先额度校准，保留安全冗�?

## 2. 当前仓库现状

现有能力�?

- `scripts/fetch-netlas-openclaw.mjs`：单 key 直连 `/api/responses/`
- `POST /api/exposure/search-ip`：本地快照检索（不走 Netlas�?
- `lib/exposure-snapshot.ts`：读取本地备份并聚合展示

结论�?

- `search-ip` 保留，不需要重做�?
- 需要把“上游抓取与调度”整合到统一网关与账本层�?

## 3. 目标架构

- `Netlas Gateway`：统一请求、重试、错误映射、�?key
- `Quota Ledger`：日/月额度账本（key �?+ 全局�?
- `Quota Calibrator`：同步前额度校准与漂移检�?
- `Sync Planner`：根据预算和优先级计算本次同步量
- `Snapshot Writer`：继续写本地 `data/backups/exposure/...`

流程�?

1. 定时任务触发同步
2. 先做额度校准（上�?vs 本地账本�?
3. 计算今日预算与同步目标数�?
4. 网关调度 key 发请�?
5. 请求、命中、任务结果全部落�?
6. 写本地快照并更新统计

## 4. 接口设计（遵循本项目 POST + JSON�?

### 4.1 统一查询

`POST /api/netlas/query`

请求示例�?

```json
{
  "request_id": "uuid",
  "endpoint": "/api/responses/",
  "params": { "q": "(http.title:\"OpenClaw Control\") OR (http.body:\"openclaw-app\") OR (http.body:\"__OPENCLAW_CONTROL_UI_BASE_PATH__\")", "start": 0 },
  "priority": "normal",
  "timeout_ms": 30000
}
```

响应示例�?

```json
{
  "status": "ok",
  "http_status": 200,
  "data": {},
  "meta": {
    "key_id": "k2",
    "request_id": "uuid",
    "retry_after": null,
    "quota_scope": "unknown"
  }
}
```

统一状态：

- `ok`
- `throttled`
- `quota_exhausted`
- `timeout`
- `upstream_error`
- `unknown`

### 4.2 同步任务入口

`POST /api/exposure/sync/run`

用于手动触发或定时触发�?

### 4.3 运维可观测接�?

- `POST /api/netlas/keys/usage`
- `POST /api/netlas/keys/health`
- `POST /api/netlas/quota/calibrate`（可选，给运维手动校准）

## 5. 多密钥调�?

不用纯轮询，使用预算感知评分�?

`score = 剩余额度�?+ 欠用�?- 错误惩罚 - 冷却惩罚`

规则�?

- 冷却/超额/封禁 key 不参与分�?
- `429` �?`Retry-After` 进入冷却
- `402` 立即标记 `quota_exhausted`
- 每轮请求前重算权�?

## 6. 账本与结�?

每次请求生命周期�?

1. �?`pending` 记录
2. 发请�?
3. 落请求响应（含响应体�?
4. 命中记录展开入库
5. 结算额度（ok/unknown/...�?

幂等�?

- �?`request_id` 做去重，防止重复记账

## 7. 同步前额度校准（重点�?

每次同步前执行：

1. 拉上游额度快照（daily/monthly/requests/coins 能拿到的都记�?
2. 读取本地账本
3. 计算漂移 `drift`
4. 写入校准快照和漂移事�?
5. 漂移超阈值时降速并扩大预留

## 8. 冗余与保�?

- 预留额度�?0%~20%
- 周上限：每周最多消耗月额度 25%~30%
- 日突发上限：不超�?`2 x today_budget`
- `unknown` 先探针对账再重试

## 9. 与现有代码的整合顺序

Phase 1�?

- 保留 `pnpm netlas:fetch` 入口
- 抽离网关层替代脚本内直连逻辑
- 输出文件格式不变（前端零改动�?

Phase 2�?

- 新增 `POST /api/exposure/sync/run`
- 增加 key 用量/健康度接�?

Phase 3�?

- 从单 key env 迁移�?key 池存�?
- 支持校准、漂移告警、自动降�?

## 10. 持久化建�?

采用 Neon(Postgres) 存储运行态：

- 好处：可审计、可回放、可对账
- 参考：
  - [NEON-INTEGRATION.md](./NEON-INTEGRATION.md)
  - [NEON-SCHEMA.sql](./NEON-SCHEMA.sql)

