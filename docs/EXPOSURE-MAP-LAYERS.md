# Exposure Map 分层规范

## 目标

- 记录地图按缩放层级切换的聚合规则。
- 记录全球层、国家层、城市层、单 IP 层的视觉差异。
- 记录四层弹出框的标题、副标题和字段内容。
- 冻结当前全球层样式，后续优先只调国家 / 城市 / 单 IP 层。

## 缩放层级

| 层级 | Zoom | 展示形态 | 当前定位 |
| --- | --- | --- | --- |
| Global | 0-3 | 国家热点锚点聚合 | 世界概览，先看哪些国家有暴露 |
| Country / Region | 4-6 | 国家级聚合 | 观察国家或大区分布 |
| City | 7-9 | 城市级聚合 | 看城市热点与局部集中区 |
| Single IP | 10-12 | 单 IP 点 | 看具体公网 IP 的位置与属性 |

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

全球层的锚点规则已经固定为“国家热点锚点”，不再使用任何中心点逻辑：

1. 每个国家只显示一个点。
2. 先在国家内按城市聚合。
3. 选择 `IPs` 最高的城市作为锚点城市。
4. 如果 `IPs` 相同，再按城市名排序。
5. 在选中的城市内，再选一条真实代表点。
6. 代表点的选择顺序是：`IP` 最小优先。
7. 最终直接使用这条真实点的原始经纬度作为国家锚点。

设计意图：

- 世界层表达的是“这个国家哪里最值得看”，不是国家几何中心，也不是首都。
- 锚点必须落在真实观测点上，避免点落到海里或落出国界。
- 点大小不表示重复命中次数，只服务于世界视角下的大概分布阅读。
- 波纹用于提供存在感和活跃感，但不能盖住底图和国界判断。

## 各层弹出框规范

### 1. Global

- 标题：国家名
- 副标题：`Zoom 0-3 hotspot anchor`
- 指标字段：
  - `Country`
  - `Anchor City`
  - `Cities`
  - `IPs`
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
  - `IPs`
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
  - `IPs`
  - `Updated`
- 排行字段：
  - `Top Organizations`
  - `Top Ports`

### 4. Single IP

- 标题：`IP`
- 副标题：`Single IP view`
- 指标字段：
  - `Country`
  - `City`（有值时显示）
  - `ISP`（有值时显示）
  - `ASN`（有值时显示）
  - `Organization`（有值时显示）
  - `Ports`
  - `Updated`

## 实现落点

- `components/exposure-map-client.tsx`
  - 缩放层级切换
  - 全球层冻结样式参数
  - 全球层热点锚点选择
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

- 当前先锁定 `Global` 层视觉和锚点规则。
- 后续如果继续调图层，优先调 `Country / Region`、`City`、`Single IP`。
- 如果要改 `Global` 层，必须同时更新这份文档中的“全球层视觉基线”和“全球层锚点规则”。
