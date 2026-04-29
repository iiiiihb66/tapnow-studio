# PROJECT_HANDOFF.md

更新时间：2026-04-29 09:30 Asia/Shanghai

## 核心交付状态
- **[P0] 多人协作持久化 (Success)**:
  - 实现基于 Yjs + LevelDB 的画布文档持久化。
  - 画布内容不再随服务重启丢失，支持多人实时协作与离线状态恢复。
- **[P1] RunningHub AI 生成闭环 (Success)**:
  - **方案**：采用 AI 应用 (AI App/WebApp) 接入，绕过标准模型 API 的企业权限限制。
  - **Endpoint**: `/openapi/v2/run/ai-app/{webappId}`
  - **配置参数**:
    - `webappId`: `2016796569449795585`
    - **Prompt 节点**: `nodeId=50`, `fieldName=text`
    - **比例节点**: `nodeId=41`, `fieldName=select`, `fieldValue=7` (设置比例)
  - **链路**: 前端触发 -> 后端转发并脱敏日志 -> 云端生成 -> 轮询状态 -> 图片自动回填预览节点。

## 最近提交与改动
- **后端**：增强了 `runninghubFetch` 的容错解析与敏感日志脱敏。
- **前端**：优化了任务 ID 兼容性读取逻辑，确保各种响应格式均能触发轮询。
- **安全**：`.env`, `data/`, `logs/` 等已通过 `.gitignore` 保护。

## 下一步计划
- [ ] 将当前 JSON 存储方案迁移至 SQLite 物理数据库 (`data/project.db`)。
- [ ] 优化多节点并发渲染性能。
- [ ] 增加多 API Key 自动轮换。
