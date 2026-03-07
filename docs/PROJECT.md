# 项目描述

## 项目概览

`claw-radar` 是一个基于 Next.js 的 Web 项目，用于可视化公开暴露的 OpenClaw 实例及相关风险信号。

## 技术栈

- 框架：Next.js（App Router）
- 运行时/UI：React + TypeScript
- 样式：Tailwind CSS v4
- 组件体系：shadcn/ui（当前配置为 `radix-nova` 风格）
- 图标：Lucide

## 架构说明

- 项目基于 Next.js 前后端一体化框架，可在同一仓库承载前端页面与后端逻辑。
- 当前代码以 Web UI 为主（`app/`、`components/`、`lib/`），后续可按需扩展 API/服务端能力。

## API 约定

- 所有前后端 API 请求统一使用 `POST`。
- 请求参数统一放在 JSON body 中，不使用 URL query 参数承载业务请求数据。

## 当前 UI 行为

- 顶部栏中间支持 IP 搜索（不依赖 URL 参数）。
- IP 搜索统一走后端接口：`POST /api/exposure/search-ip`（JSON body: `{ "ip": "x.x.x.x" }`）。
- 搜索结果统一分为三种：IP 错误、匹配不上、匹配上（并定位高亮弹出详情）。
- 搜索结果提示统一使用 `sonner` 的 `toast`：`success / info / warning / error`。
- 地图在匹配成功时会自动定位、高亮并自动弹出点位信息。
- 点位弹窗包含更新时间（当前快照生成时间）。
- 前后端交互不操作路由参数，搜索联动采用前端事件驱动，不会触发整页重新请求（柱状图不会因搜索而刷新）。

## 目录分工

- `app/`：App Router 页面、布局、全局样式
- `components/`：可复用组件（包含 `components/ui`）
- `lib/`：公共工具函数
- `scripts/`：本地执行脚本（例如 Netlas 数据抓取）
- `data/backups/`：本地备份数据（默认 git 忽略）

## 本地开发

```bash
pnpm install
pnpm dev
```

常用脚本：

- `pnpm dev`：启动开发环境
- `pnpm build`：构建生产包
- `pnpm start`：启动生产服务
- `pnpm lint`：执行代码检查
- `pnpm netlas:fetch`：调用 Netlas API 并写入本地备份（Free 自动化推荐）
