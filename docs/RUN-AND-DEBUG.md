# 本地运行与自动排错

## 适用范围

- Next.js 本地预览启动与修复
- 页面无数据排查
- 终端报错与前端 hydration 报错定位

## 自动排错流程

1. 由 Codex 启动或接管 `pnpm dev`。
2. Codex 持续读取终端日志（编译、构建、运行时错误）。
3. 发现报错后直接修复代码并复验。
4. 直到本地可预览为止。

## 关于浏览器 Console 报错

- 浏览器扩展注入导致的 hydration mismatch，终端常常看不到。
- 建议先用无痕窗口复现，排除扩展干扰。
- 后续可接入 Playwright 自动采集 console/error，做到更完整的自动修复闭环。

## 本地无数据的核心原因

当前页面读取数据库聚合（`netlas_instances`），常见无数据原因：

- `DATABASE_URL` 配置错误或连接失败。
- 从未执行过同步任务（表存在但没有实例数据）。
- 同步任务失败（可在 `netlas_sync_jobs` / `netlas_requests` 查看状态）。

## 恢复数据展示

1. 在 `.env.local` 配置必要变量：

```bash
NETLAS_API_KEYS=key1,key2
DATABASE_URL=postgresql://...
NETLAS_ENCRYPTION_KEY=...
```

2. 执行写库同步：

```bash
pnpm netlas:validate
```

3. 刷新页面确认地图与图表是否有数据。

## 常用命令

- 本地预览：`pnpm dev`
- 本地抓取：`pnpm netlas:fetch`
- 只迁移实例表：`pnpm netlas:migrate-instances`
- Neon 写库同步：`pnpm netlas:validate`


## 抓取调优参数（节约请求）

- NETLAS_MIN_NEW_PER_PAGE：每页最少新增记录阈值（默认 3）。
- NETLAS_MAX_LOW_NEW_PAGES：连续低增量页达到该值后提前停页（默认 2）。
- NETLAS_DUPLICATE_RATIO_STOP：重复率阈值，超过后触发停页判定（默认 0.92）。
- NETLAS_FETCH_RETRIES：临时网络/限流重试次数（默认 1）。
- NETLAS_RETRY_BASE_MS：重试基准退避毫秒（默认 800）。
