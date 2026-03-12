# Dictionary Design (app_dictionary)

## 1. 目标

统一管理服务端运行字典（配置、阈值、映射规则），避免散落在环境变量和硬编码中。

## 2. 数据表

表名：`app_dictionary`

- `dict_path`：字典路径（唯一），如 `netlas.validation.default_max_keys`
- `namespace`：路径一级命名空间（如 `netlas`）
- `value_type`：`string | number | boolean | json`
- `value`：`jsonb` 值（统一存储）
- `description`：用途说明
- `is_active`：是否启用
- `updated_by`：更新来源（人/任务）
- `created_at / updated_at`：时间戳

DDL 已落在：

- `docs/NEON-SCHEMA.sql`

## 3. 通用接口（字典转换）

实现文件：

- `lib/server/dictionary-store.mjs`

核心接口：

- `ensureDictionaryTable(client)`：确保字典表存在
- `seedRuntimeDictionary(client)`：把运行时默认字典 seed 到 DB（仅插入缺失项）
- `getDictionaryEntry(client, path)`：读取原始字典行
- `getDictionaryValue(client, path, fallback)`：读取并做基础类型转换
- `getDictionaryString(client, path, fallback)`
- `getDictionaryNumber(client, path, fallback)`
- `getDictionaryBoolean(client, path, fallback)`
- `getDictionaryJson(client, path, fallback)`
- `upsertDictionaryValue(client, payload)`：通用写入/更新接口

## 4. 运行时默认字典

默认值定义在：

- `lib/server/runtime-dictionary.mjs`

当前默认路径：

- `netlas.validation.default_max_keys`
- `netlas.validation.max_keys_limit`
- `netlas.cron.default_max_keys`
- `netlas.cron.max_keys_limit`

## 5. 同步链路接入点

文件：

- `scripts/validate-netlas-neon.mjs`

流程：

1. `bootstrapSchema` 创建表结构
2. `seedRuntimeDictionary` 补齐默认字典
3. 读取 `netlas.validation.*` 做 `max_keys` 解析和边界收敛

## 6. 建议约束

- `NETLAS_ENCRYPTION_KEY` 统一由环境变量注入，禁止硬编码到仓库。
- 数值类字典统一走 `getDictionaryNumber`，禁止直接字符串转数值
- 对外部输入路径先走 `normalizeDictionaryPath` 规范化
