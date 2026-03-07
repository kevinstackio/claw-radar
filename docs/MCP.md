# MCP 集成说明

## MCP 是什么

MCP（Model Context Protocol）可以让 AI 客户端连接到 shadcn 的 MCP Server，在对话中直接检索组件、区块和 registry 资源。

官方文档：

- [shadcn MCP](https://ui.shadcn.com/docs/mcp)

## 为什么你在 Next.js 项目里看不到“对应 MCP 文件”

- MCP 不是 Next.js 框架内置功能，所以项目初始化时不会自动生成 MCP 文件。
- MCP 配置主要在 AI 客户端侧（Codex/Cursor/VS Code/Claude），不是 `next.config.ts` 这类项目运行时配置。
- 对你这个仓库来说，`components.json` 已经是关键前提文件，MCP 会基于它读取 registry 配置。

## 如何整合到项目

- 项目内（可提交）：仅维护接入说明、示例和团队约定。
- 本机客户端（不强制提交）：在你使用的 AI 客户端中启用 MCP。

## 快速接入

### 方式 1：shadcn 命令初始化

```bash
pnpm dlx shadcn@latest mcp init --client codex
```

把 `codex` 替换为你实际使用的客户端（如 `cursor`、`vscode`、`claude`）。

### 方式 2：Codex 手动配置示例

在 `~/.codex/config.toml` 中加入：

```toml
[mcp_servers.shadcn]
command = "npx"
args = ["shadcn@latest", "mcp"]
```

## 项目约定

- 本仓库不提交个人本机配置文件。
- 需要共享配置时，提交 `*.example` 示例文件即可。

## 实践流程（在本项目里怎么用）

1. 在 Codex 配置好 shadcn MCP（见上面的 `~/.codex/config.toml`）。
2. 重启 Codex，确保 MCP server 已加载。
3. 在本项目对 AI 下达任务，例如：
   - `列出 shadcn registry 可用的 form 相关组件`
   - `把 button、dialog、card 加到当前项目`
   - `基于现有组件做一个登录页`
4. 检查变更文件是否符合项目结构（`components/ui`、`app`、`lib`）。
