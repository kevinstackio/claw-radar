# Exposure Map 分层规范

## 目标

- 记录地图按缩放层级切换的聚合规则。
- 记录全球层、国家层、城市层、单实例层的视觉差异。
- 记录四层弹出框的标题、说明和字段内容。
- 冻结当前全球层样式，后续优先只调国家 / 城市 / 单实例层。

## 缩放层级

| 层级 | Zoom | 展示形态 | 当前定位 |
| --- | --- | --- | --- |
| Global | 0-3 | 国家锚点聚合 | 世界概览，先看哪些国家有暴露 |
| Country / Region | 4-6 | 国家级聚合 | 观察国家或大区分布 |
| City | 7-9 | 城市级聚合 | 看城市热点与局部集中 |
| Single Instance | 10-12 | 单实例点 | 看具体资产位置与属性 |

## 全球层视觉基线

当前全球层样式视为冻结基线，除非明确重新评审，否则不要继续改动：

- 点半径：`4.1`
- 点样式：无描边，仅填充
- 填充色：`--map-marker-fill`
- 填充透明度：`0.68`
- 主波纹半径偏移：`+2.1`
- 次波纹半径偏移：`+4.1`
- 主波纹线宽 / 透明度：`1.2 / 0.58`
- 次波纹线宽 / 透明度：`1.0 / 0.40`
- 波纹动画：`2.45s`
- 次波纹延迟：`0.92s`
- 波纹缩放：`0.84 -> 1.26`
- 锚点语义：每个国家只显示一个点
- 锚点位置：
  - 先计算该国家当前暴露点范围的中心目标
  - 再选择该国家内最接近这个中心目标的真实观测点作为最终锚点
  - 不直接使用首都

设计意图：

- 默认世界视角不强调数量大小，只强调大概分布位置。
- 点本体保持小且稳定，避免遮盖国家边界。
- 波纹用于提供活性和存在感，但不能抢走地图底图的阅读权。
- 全球层表达的是“国家存在暴露”，不是“实例真实落点”。
- 当前实现优先保证锚点一定落在该国家的真实观测点上，其次再尽量靠近中心。

## 各层弹出框规范

### 1. Global

- 标题：国家名
- 副标题：`Zoom 0-3 country anchor`
- 指标字段：
  - `Country`
  - `Cities`
  - `Instances`
  - `Seen`
  - `Points`
  - `Updated`
- 排行字段：
  - `Top Cities`
  - `Top Ports`

### 2. Country / Region

- 标题：国家名，缺失时回退到聚合标签
- 副标题：`Country / region aggregate`
- 指标字段：
  - `Country`
  - `Cities`
  - `Instances`
  - `Seen`
  - `Points`
  - `Updated`
- 排行字段：
  - `Top Cities`
  - `Top Ports`

### 3. City

- 标题：城市名；缺失时回退为 `${country} Area`
- 副标题：`${country} city aggregate` 或 `City aggregate`
- 指标字段：
  - `City`
  - `Country`
  - `Instances`
  - `Seen`
  - `Points`
  - `Updated`
- 排行字段：
  - `Top Organizations`
  - `Top Ports`

### 4. Single Instance

- 标题：`IP`
- 副标题：`Single instance view`
- 指标字段：
  - `Country`
  - `City`（有值时显示）
  - `ISP`（有值时显示）
  - `ASN`（有值时显示）
  - `Organization`（有值时显示）
  - `Instances`
  - `Seen`
  - `Ports`
  - `Updated`

## 实现落点

- `components/exposure-map-client.tsx`
  - 缩放层级切换
  - 全球层冻结样式参数
  - 四层弹出框内容
- `app/globals.css`
  - 点颜色
  - 波纹动画
  - 阴影和 hover 反馈
- `lib/exposure-snapshot.ts`
  - 城市字段聚合
- `lib/exposure-types.ts`
  - `city` 字段类型定义

## 后续调整原则

- 当前先锁定 `Global` 层视觉。
- 如果后续继续调图层，优先调 `Country / Region`、`City`、`Single Instance`。
- 如果要改 `Global` 层，必须同时更新本文件中的“全球层视觉基线”。
