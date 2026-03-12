# Free 自动化方案（推荐 Netlas）

目标：不升级付费套餐，尽量实现自动采集 + 本地备份 + 地图打点。

## 为什么换平台

- Netlas Community 支持 API 调用搜索端点，适合做低频（如 48 小时）自动任务。

## 1. 注册并拿 Netlas API Key

1. 打开 `app.netlas.io` 注册并登录。
2. 在账号设置中创建 API Key。
3. 写入 `.env.local`：

```bash
NETLAS_API_KEY=你的key
NETLAS_QUERY=(http.title:"OpenClaw Control") OR (http.body:"openclaw-app") OR (http.body:"__OPENCLAW_CONTROL_UI_BASE_PATH__")
NETLAS_MAX_PAGES=10
```

说明：

- 上面是更高置信的 OpenClaw 指纹组合查询。
- Free 账户每次抓取建议 `NETLAS_MAX_PAGES=10`（每页约 1 次请求）。

## 2. 执行自动抓取

命令：

```bash
pnpm netlas:fetch
```

输出：

- 备份文件：`data/backups/exposure/YYYY-MM-DD/openclaw-netlas-<timestamp>.json`
- 最新索引：`data/backups/exposure/latest.json`

这些文件用于本地离线核对；线上仪表盘读数据库聚合结果。

## 3. 48 小时定时执行（macOS）

`launchd` 示例（`StartInterval=172800`）：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>com.clawradar.netlas.fetch</string>
    <key>WorkingDirectory</key>
    <string>/Users/kevin/Documents/git/claw-radar</string>
    <key>ProgramArguments</key>
    <array>
      <string>/bin/zsh</string>
      <string>-lc</string>
      <string>pnpm netlas:fetch</string>
    </array>
    <key>StartInterval</key>
    <integer>172800</integer>
    <key>RunAtLoad</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/clawradar-netlas.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/clawradar-netlas.err.log</string>
  </dict>
</plist>
```

## 4. 误报控制建议

- 候选召回：端口（如 `18789`）+ 基础服务特征。
- 二次确认：响应关键字、证书字段、服务协议字段。
- 不要只靠端口判定 OpenClaw。

## 5. 请求预算建议（50 次/天）

- 每次抓取请求数约等于 `NETLAS_MAX_PAGES`。
- 推荐配置：`NETLAS_MAX_PAGES=10` + 每 48 小时执行一次，平均约 5 次/天。
- 如果临时需要手动重跑，先估算当日剩余配额再执行。
