# 信息披露与 Toast 分级规范

## 1. 目标
- 统一页面信息披露层级，避免“信息抢权”和视觉噪声。
- 统一 toast 触发条件、语气、级别和交互时机。
- 后续新增/修改页面时，优先按本规范分级，再决定样式。

## 2. 信息披露分级（L0-L4）

### L0 结构层（容器/分组）
- 用于区分区域，不承载业务结论。
- 样式：`bg-card`、`border-border`、`rounded-*`。
- 内容：标题栏、分组边界、tab 容器。

### L1 核心结论层（Primary Value）
- 用户进页面 3 秒内必须看到的关键值。
- 示例：`Total`、风险总量、主 KPI。
- 样式建议：`text-foreground text-base font-semibold`。

### L2 关键辅助层（Secondary Value）
- 支撑 L1 的关键补充信息。
- 示例：`Countries`、命中数量、分布计数。
- 样式建议：`text-foreground text-sm font-medium`。

### L3 解释说明层（Label/Description）
- 标签、描述、来源说明。
- 示例：字段名称、说明文案、数据来源解释。
- 样式建议：`text-muted-foreground text-[11px] uppercase tracking-wide`（标签）；
  `text-foreground text-sm leading-relaxed`（段落说明）。

### L4 元信息层（Meta/Time/Hint）
- 非主流程信息，不应抢占注意力。
- 示例：更新时间、补充提示、次级注释。
- 样式建议：`text-muted-foreground text-xs`。

## 3. 布局落地规则
- Summary 默认用“左标签 + 右值”双列行布局。
- 同一分组中，L1/L2 值的字号和字重必须一致；不要混用多种强调方式。
- 同一块中最多 1 个 L1 值，避免多个“主角”。
- 说明类（L3）应放在值下方或独立段落，避免插入到主值行中。
- 元信息（L4）默认右对齐或底部，不与 L1/L2 抢视觉中心。

## 4. Toast 分级规范

### `success`
- 触发：用户主动操作且结果成功。
- 文案：简短确认，不重复页面已明确显示的信息。
- 示例：`Search completed`。

### `info`
- 触发：中性反馈、状态告知、无风险结果。
- 示例：`No matching IP found`。

### `warning`
- 触发：可恢复问题、输入问题、需用户调整。
- 示例：`Invalid IP format`。

### `error`
- 触发：请求失败、系统错误、关键流程中断。
- 示例：`Search failed, please try again`。

## 5. Toast 交互规则
- 同一业务流使用固定 `id` 去重（避免连续弹多个重复提示）。
- 一次操作只弹一个最高优先级结果（`error > warning > info > success`）。
- 文案统一英文，除非有明确中文需求。
- 不使用 toast 承载长说明；长说明放页面内（L3）。

## 6. 文案模板
- 标签模板：`NOUN`（如 `TOTAL`、`COUNTRIES`、`UPDATED`）。
- 值模板：简短、可扫描，避免句子化。
- Toast 模板：`[Action] + [Result]` 或 `[Issue] + [Next Step]`。

## 7. 实施清单（每次改 UI 必查）
- 是否先完成信息分级，再写样式。
- 是否保证同级信息视觉一致（字号/字重/色值）。
- 是否限制主强调信息数量（每组不超过 1 个 L1）。
- 是否按规则选择 toast 级别，并使用去重 `id`。
- 是否避免把页面内说明滥用为 toast。
## 8. Token-First Rule (Enforced)
- In feature components, do not introduce one-off hardcoded visual styles first.
- Always check existing tokens in `lib/ui-information.ts` (and theme tokens) before adding styles.
- If no suitable token exists, define a shared token first, then reference it from components.
- Hardcoding is allowed only as a last resort and must include a short reason in code comments or PR notes.
