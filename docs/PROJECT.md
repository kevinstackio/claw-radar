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

## 组件与主题规范（强制）

- 基础组件必须使用 shadcn/ui 体系，统一放在 `components/ui/`（例如 `Button`、`Tabs`、`Dialog`、`Input`）。
- 简单业务组件必须通过基础组件组合实现，不直接引入第二套基础 UI 框架。
- 业务层组件默认放在 `components/`，并复用 `components/ui/` 的能力与样式 token。
- 第三方组件库仅在 shadcn/ui 不适合的场景引入，例如地图、图表、富文本、可视化引擎。
- 第三方组件接入必须先封装一层业务组件，禁止在页面中大面积直接散落第三方 API 调用。
- 所有新增/修改组件必须支持白天/黑夜模式。
- 颜色、边框、背景、阴影优先使用主题 token（如 `bg-background`、`text-foreground`、`border-border`），避免在组件中写死十六进制颜色。
- 图标统一使用 `lucide-react`，禁止混用多套图标库；新增图标需与现有线性风格保持一致。
- 如第三方库必须使用显式颜色值，必须同时提供 light/dark 两套映射，并通过主题状态切换。

## 视觉一致性规范（强制）

- 字体统一使用全局 `--font-sans`（Next Font 注入），禁止在页面或组件中直接声明 `font-family`。
- 颜色统一使用主题 token（`background / foreground / muted / border / ring / primary`），禁止新增硬编码颜色。
- 圆角统一使用设计 token（`rounded-sm / rounded-md / rounded-lg` 等），避免任意像素圆角；确有必要需注明原因。
- 边框统一使用 `border-border`，分隔线统一走 `border-t / border-b + border-border`。
- 阴影优先使用语义化层级（`shadow-sm / shadow`），避免随意自定义大阴影。
- 动效统一以 `transition-colors` 为主，默认时长 `duration-200`；复杂动效应保持轻量并可预期。
- 交互组件优先使用 shadcn 体系（Button/Tooltip/Dialog/Tabs 等），避免自写交互基础层。
- 交互提示禁止依赖原生 `title` 作为主要方案，优先使用 shadcn `Tooltip`。
- 交互状态（hover / active / focus / disabled）必须在 light/dark 下都保持可读与对比度一致。
- 图标按钮与主题按钮的 hover/focus/active 反馈需保持一致，优先复用 `Button` 组件语义。

## 本地开发

> 包管理器约定：本项目仅允许使用 pnpm，请勿使用 npm 或 yarn。

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

## Radix-only Policy (Enforced)
- This project uses shadcn/ui with Radix primitives only.
- Do not add Base UI dependencies or imports (including @base-ui/* or base-ui).
- For interactive primitives (Dialog, Tooltip, Tabs, etc.), use shadcn components backed by Radix.
- If any future migration is needed, it must be proposed in docs first and approved before code changes.
