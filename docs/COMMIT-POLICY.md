# 提交策略（强制）

这份规则用于约束后续的 `git commit` 行为，目标是让历史更容易检索、回滚和审计。

## 1. 默认策略

- 默认使用“分类拆分提交”，禁止把多类改动混成一条提交。
- 当本地积累改动较多（跨多个模块或主题）时，必须拆成多条 commit。

## 2. 拆分维度

- `feat`：新功能
- `fix`：问题修复
- `refactor`：重构（不改行为）
- `docs`：文档变更
- `chore`：脚本、配置、依赖、工程化

## 3. 提交顺序

- 先提交基础设施和数据结构（如 `schema`、迁移、配置）。
- 再提交业务逻辑或功能代码。
- 最后提交文档和收尾整理。

## 4. 提交信息要求

- 每条 commit message 必须说明三件事：改了什么、为什么改、影响范围。
- 示例：
  - `chore(db): add netlas quota calibration tables for key pool scheduling`
  - `fix(fetch): dedupe by hit hash and skip invalid coordinates`
  - `docs(netlas): document balanced mode and retry strategy`

## 5. 执行约定

- 当你说“帮我 commit”且改动积累较多时，我会默认按上面规则自动拆分成多条提交并写清备注。
- 只有你明确要求“压成一条提交（squash）”时，才会改用单条提交。
