# Skills 集成说明

## Skills 是什么

Skills 用于给 AI 提供固定的知识和工作流程。  
在 shadcn 场景下，Skills 可以让 AI 更稳定地按 shadcn 规范生成和修改 UI。

官方文档：

- [shadcn Skills](https://ui.shadcn.com/docs/skills)

## 为什么你在 Next.js 项目里看不到“对应 Skills 文件”

- Skills 主要安装在 AI 客户端（例如 Codex 的 `$CODEX_HOME/skills`），不是 Next.js 项目依赖。
- 所以仓库里不会自动出现 `skills/` 运行时代码目录。
- 仓库里保留的是“项目约束文档”，用于让团队协作时输出一致。

## 快速接入

```bash
pnpm dlx skills add shadcn/ui
```

也可以根据你使用的客户端文档，通过 `/skills` 等方式添加。

## 与项目的关系

- Skills 生效位置是 AI 客户端侧（例如 Codex 的 `$CODEX_HOME/skills`），不是 Next.js 运行时代码。
- 本仓库用于沉淀项目级规范文档，方便团队统一使用。

## 建议做法

- 先安装 `shadcn/ui` 官方 Skills。
- 再结合本项目的 `CODEX-RULES.md`，形成稳定协作规则。

## 实践流程（在本项目里怎么用）

1. 在客户端安装 `shadcn/ui` Skills。
2. 在本仓库任务中明确要求 AI 按 shadcn 规范输出，例如：
   - `按 shadcn 规范生成一个带表单校验的登录页面`
   - `把页面拆成 page + components/ui 复用组件`
3. 让 AI 对照项目规约自检：
   - 是否使用 TypeScript
   - 是否复用 `components/ui`
   - 是否保持小步改动、可审查
