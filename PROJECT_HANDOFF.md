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
  - **[P2B] 基础设施搭建 (Success)**: 已完成 `sqlite-store.cjs` 封装，支持 Tasks, Settings, Workflows。通过独立冒烟测试，暂未接入业务逻辑。

## 最近提交与改动
- **后端**：新增 `better-sqlite3` 驱动与 `server/sqlite-store.cjs` 存储层。
- **文档**：更新 `SQLITE_OPERATIONS.md` 记录最新表结构。
- **安全**：确认 `server/data/project.db` 已被忽略，数据持久化底座已初步就绪。

## 下一步计划
- [ ] **[P2C] RunningHub 任务数据迁移**: 将 `/api/runninghub/tasks` 路由切换至 SQLite。
- [ ] 将当前 JSON 存储方案迁移至 SQLite 物理数据库 (`data/project.db`)。
- [ ] 优化多节点并发渲染性能。
- [ ] 增加多 API Key 自动轮换。
