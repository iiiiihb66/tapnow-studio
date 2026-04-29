# PROJECT_HANDOFF.md

更新时间：2026-04-29 09:30 Asia/Shanghai

## 核心交付状态
- **[P0] 多人协作持久化 (Success)**:
  - 实现基于 Yjs + LevelDB 的画布文档持久化。
  - 画布内容不再随服务重启丢失，支持多人实时协作与离线状态恢复。
- **[P1] RunningHub AI 生成闭环 (Success)**:
  - **方案**：采用 AI 应用 (AI App/WebApp) 接入，绕过标准模型 API 的企业权限限制。
  - **Endpoint**: `/openapi/v2/run/ai-app/{webappId}`
  - **配置参数**: `webappId: 2016796569449795585`, `nodeId=50`, `41`。
  - **链路**: 前端触发 -> 后端转发并脱敏日志 -> 状态轮询 -> 图片自动回填。
- **[P2] SQLite-first 迁移 (In Progress)**:
  - [x] SQLite-first 基础设施搭建 (P2B)
  - 已完成 `sqlite-store.cjs` 封装，支持 Tasks, Settings, Workflows。
- [x] RunningHub 任务数据迁移至 SQLite (P2C)
  - 已实现启动时自动从 `runninghub-db.json` 迁移 Tasks 到 SQLite。
  - 所有任务相关的 CRUD 路由已切换为 SQLite 优先。
  - 保持了前端 API 字段的 camelCase 兼容性。
- [ ] 迁移 Settings/Workflows 到 SQLite (P2D)
- [ ] 将当前 JSON 存储方案迁移至 SQLite 物理数据库 (`data/project.db`)。
- [ ] 优化多节点并发渲染性能。
- [ ] 增加多 API Key 自动轮换。

## 最近提交与改动
- **后端**：新增 `better-sqlite3` 驱动与 `server/sqlite-store.cjs` 存储层。
- **文档**：更新 `SQLITE_OPERATIONS.md` 记录最新表结构与业务分析处理。
- **安全**：确认 `server/data/project.db` 已被忽略，数据持久化底座已初步就绪。

## 下一步计划
- [ ] 迁移 Settings/Workflows 到 SQLite (P2D)。
- [ ] 优化多节点并发渲染性能。
- [ ] 增加多 API Key 自动轮换。
