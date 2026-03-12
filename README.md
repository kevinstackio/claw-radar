<p align="center">
  <img src="./public/claw-radar-icon.svg" alt="ClawRadar Logo" width="120" />
</p>

# ClawRadar

ClawRadar 是一个基于 Next.js 的可视化项目，用于展示全球范围内公开暴露的 OpenClaw 实例，并辅助识别潜在安全风险。

## 功能概览

- 全球暴露点位地图展示（Leaflet）
- 国家维度暴露分布图（饼图/柱状图切换）
- 头部 IP 搜索（`POST /api/exposure/search-ip`）
- 数据库聚合读取与展示（Neon/Postgres）
- 主题切换（Light/Dark）

## 技术栈

- Next.js 16（App Router）
- React 19 + TypeScript
- Tailwind CSS v4
- shadcn/ui（Radix primitives）
- react-leaflet + OpenStreetMap
- recharts

## 快速开始

### 1) 环境准备

- Node.js（建议 20+）
- pnpm（本项目仅支持 pnpm）

### 2) 安装依赖

```bash
pnpm install
```

### 3) 配置环境变量

复制 `.env.example` 到 `.env.local`，至少填写：

```bash
DATABASE_URL=postgresql://...
NETLAS_ENCRYPTION_KEY=你的强随机密钥
NETLAS_API_KEYS=你的_key1,你的_key2
NETLAS_QUERY=(http.title:"OpenClaw Control") OR (http.body:"openclaw-app") OR (http.body:"__OPENCLAW_CONTROL_UI_BASE_PATH__")
NETLAS_BASE_URL=https://app.netlas.io
NETLAS_MAX_PAGES=10
NETLAS_START_STEP=20
NETLAS_TIMEOUT_MS=30000
NETLAS_INCLUDE_RAW_PAGES=false
```

### 4) 执行同步写库（推荐）

```bash
pnpm netlas:validate
```

### 5) 启动开发服务

```bash
pnpm dev
```

访问：`http://localhost:3000`

## 常用命令

- `pnpm dev`：启动开发环境
- `pnpm build`：构建生产包
- `pnpm start`：启动生产服务
- `pnpm lint`：执行代码检查
- `pnpm test:netlas-core`：执行 Netlas 同步核心逻辑单测（planner/usage/dedupe）
- `pnpm format:check`：格式规则检查（基于 ESLint）
- `pnpm verify`：完整校验（format + lint + build）
- `pnpm netlas:fetch`：调用 Netlas API 拉取并落盘本地快照
- `pnpm netlas:validate`：执行 Netlas 同步并写入 Neon

## Git Hook（推荐）

为避免“本地没问题，推送后构建失败”的情况，建议启用仓库自带 hooks：

```bash
git config core.hooksPath .githooks
```

启用后：

- `pre-commit`：执行 `format:check` + `lint`（快速反馈）
- `pre-push`：执行 `verify`（format + lint + build，严格兜底）

## 数据流说明

1. `scripts/validate-netlas-neon.mjs` 从 Netlas API 拉取数据并写入 Neon。
2. `lib/exposure-snapshot.ts` 在服务端读取 `netlas_hits` 聚合结果，完成清洗、国家聚合与地图点位转换。
3. 首页 `app/page.tsx` 将快照传入仪表盘组件，地图和图表共享同一份快照数据。
4. IP 搜索通过 `POST /api/exposure/search-ip` 在当前快照中匹配，前端收到结果后触发地图定位与高亮。

## API

### `POST /api/exposure/search-ip`

请求体：

```json
{
  "ip": "8.8.8.8"
}
```

返回 `status`：

- `matched`：匹配成功
- `not_found`：未匹配到
- `invalid`：IP 格式无效
- `error`：服务异常

## 目录结构

```text
app/                    Next.js 页面与 API 路由
components/             业务组件与 UI 组件
lib/                    数据处理与通用方法
scripts/                本地脚本（如 Netlas 抓取）
docs/                   项目规范与专项文档
public/                 静态资源
data/backups/exposure/  可选本地备份（默认被 .gitignore 忽略）
```

## 文档导航

更多项目规范与说明见 [`docs/README.md`](docs/README.md)：

- `docs/PROJECT.md`：项目说明、技术栈、开发约束
- `docs/CODEX-RULES.md`：仓库内执行规则
- `docs/FREE-AUTOMATION.md`：免费自动化抓取方案（Netlas）

## 许可

本项目使用 [MIT License](LICENSE)。

## 免责声明

本项目用于安全研究与防御分析，请确保遵守当地法律法规与平台服务条款；请勿将数据用于未授权攻击或其他非法用途。
