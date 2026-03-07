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
