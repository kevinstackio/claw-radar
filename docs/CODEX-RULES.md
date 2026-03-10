# Codex 项目规约

这份文档是给 Codex 在 `claw-radar` 仓库内执行任务时使用的项目特定规则。

## 与 Skills 的边界

- Skills：放通用能力与框架知识（例如 shadcn 的最佳实践）。
- 本文档：放本项目独有约束（目录习惯、提交粒度、实现偏好）。
- 冲突处理：同一事项只保留一处权威来源，优先写在本文档。

## 项目内执行规则

- 优先复用现有目录：`app/`、`components/`、`lib/`。
- 新增 UI 组件优先走 shadcn/ui 风格，不混入多套 UI 体系。
- 默认使用 TypeScript，保持类型完整，不引入 `any` 作为常规方案。
- 修改尽量小步可审查：一次只解决一个明确问题。
- 文档变更同步更新 `docs/README.md` 导航。
- 前后端 API 交互统一使用 `POST`（JSON body），不使用 query 参数承载业务请求数据。

## 任务执行流程（强制）

- 每次接到任务后，先对照本文档与 `docs/PROJECT.md`，确认组件规范、API 约束与改动边界。
- 开始实现前先判断本次是否需要更新文档；若判断为不需要，交付说明中也要明确写出理由。
- 实现完成后，必须逐条执行“组件验收清单”，并在交付说明中明确验收结果。
- 任务涉及新增/修改/删除组件时，必须额外检查引用完整性、主题一致性、样式 token 使用与死代码残留。
- 无法执行 lint/test 时，必须在交付说明中明确阻塞原因、未验证项与潜在风险。

## 提交前清理清单（强制）

- 删除是否清理干净：组件引用、路由入口、类型定义、样式、文档、脚本及相关调用链。
- 是否存在残留数据：临时文件、调试日志、mock 数据、无用资源、注释掉的废弃代码。
- 是否存在未使用导入/变量、重复实现、过期常量，避免把无关改动带入提交。
- 提交前必须再次评估是否需要同步 `docs/`；行为或规范变化必须更新文档。
- 提交说明必须覆盖：改动内容、影响范围、兼容性风险与必要回滚点。

## 组件变更规范（新增 / 修改 / 删除）

- 新增组件时，先判断是否属于基础组件。
- 基础组件只能在 `components/ui/` 内新增，并遵循 shadcn/ui 风格与 API 设计。
- 简单业务组件必须组合 `components/ui/` 组件实现，不直接重复造基础控件。
- 修改组件时，不得绕开主题 token 直接写死颜色；确有必要时需补齐 light/dark 映射。
- 删除组件时，必须同时清理引用、类型与样式残留，确保构建与 lint 通过。
- 引入第三方 UI 库前，必须明确 shadcn/ui 无法满足需求，并说明使用范围。
- 地图、图表等第三方组件必须封装在业务组件层，且在白天/黑夜模式下可读、可用、对比度达标。
- 页面层（`app/`）优先消费业务组件，不直接拼接大量第三方 UI 细节。
- 交互基础能力（提示、弹层、切换、表单交互）优先使用 shadcn 组件，不直接依赖原生交互实现。
- 图标统一使用 `lucide-react`，不得混入其它图标库（迁移任务除外）。

## 组件验收清单（每次改动必查）

- 是否优先复用了 `components/ui/` 现有能力。
- 是否满足 light/dark 双主题显示一致性（包含 hover、active、disabled）。
- 是否避免了硬编码颜色（十六进制、固定 RGB/RGBA）。
- 是否保持字体、圆角、动效的一致 token 使用。
- 是否统一交互状态（hover/active/focus/disabled）在 light/dark 下的视觉一致性。
- 交互提示是否使用 shadcn Tooltip（而非原生 `title`）作为默认实现。
- 图标按钮是否复用 Button 语义并保持交互反馈一致。
- 第三方组件是否完成主题适配与封装隔离。
- 组件新增/修改/删除后是否通过 `pnpm lint`。

## 交付要求

- 每次交付必须包含：验收清单执行结果、文档更新判断、提交前清理结论。
- 包管理器仅允许使用 `pnpm`，禁止使用 `npm` 或 `yarn`。
- 提交前至少通过一次 `pnpm lint`（如果任务涉及代码改动）。
- 只要用户提出“提交/commit”，必须先检查当前改动是否需要同步更新 `docs/`；要明确判断应更新哪份文档，必要时新增文档，且避免“为了更新而更新”。
- 影响行为的改动必须在说明中写清“改了什么、为什么、影响范围”。

## Radix-only Policy (Enforced)
- This project uses shadcn/ui with Radix primitives only.
- Do not add Base UI dependencies or imports (including @base-ui/* or base-ui).
- For interactive primitives (Dialog, Tooltip, Tabs, etc.), use shadcn components backed by Radix.
- If any future migration is needed, it must be proposed in docs first and approved before code changes.
