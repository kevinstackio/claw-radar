# ECharts 集成与 AI 扩展核查

核查日期：2026-03-08

## 项目内接入状态

- 已安装依赖：`echarts`、`echarts-countries-js`（用于世界地图 GeoJSON）
- 图表组件：`components/echarts-exposure-chart.tsx`
- 页面接入：`app/page.tsx`

## ECharts 是否有 MCP

有。

- Apache 官方仓库存在 MCP Server：`apache/echarts-mcp`
  - https://github.com/apache/echarts-mcp
- 社区也有第三方实现：`hustcc/mcp-echarts`
  - https://github.com/hustcc/mcp-echarts

## ECharts 是否有 Skills

当前未检索到 Apache ECharts 官方发布的、类似 shadcn 的“Skills”产品形态。

- ECharts 官方文档主页（未见 Skills 专章）：
  - https://echarts.apache.org/en/index.html
- 官方主仓库：
  - https://github.com/apache/echarts

说明：这里的结论是基于官方站点与官方仓库的公开信息。若后续官方新增 Skills，可在本文件更新。
