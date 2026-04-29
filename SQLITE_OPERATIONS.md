# SQLITE_OPERATIONS.md

## 数据库路径
`server/data/project.db`

## 当前状态 (P2B 完成)
- **基础设施**: 已完成。`server/sqlite-store.cjs` 已实现基础 CRUD 方法。
- **业务接入**: **尚未接入**。当前 `server/index.js` 仍在使用 JSON 存储。
- **冒烟测试**: 已通过。支持任务、设置、工作流、KV 的独立读写。

## 表结构设计

### 1. `runninghub_tasks` (核心生成任务)
| 字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| id | TEXT (PK) | 本地生成的任务 ID (数字或 UUID) |
| remote_task_id | TEXT | RunningHub 云端返回的 taskId |
| provider | TEXT | 供应商标识 (runninghub) |
| type | TEXT | 任务类型 (workflow / ai-app) |
| source_node_id | TEXT | 前端画布关联的 nodeId |
| prompt | TEXT | 生成所用的提示词 |
| status | TEXT | 状态 (QUEUED / RUNNING / SUCCESS / FAILED) |
| output_url | TEXT | 生成图片的最终 URL |
| error | TEXT | 错误信息 |
| raw_json | TEXT | 完整的响应 JSON 字符串 |
| created_at | TEXT | ISO 创建时间 |
| updated_at | TEXT | ISO 更新时间 |

### 2. `app_settings` (全局应用配置)
| 字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| key | TEXT (PK) | 配置项键名 |
| value_json | TEXT | JSON 格式的配置值 |
| updated_at | TEXT | 更新时间 |

### 3. `workflows` (已保存的工作流模板)
| 字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| id | TEXT (PK) | 模板 ID (`wf_...`) |
| name | TEXT | 模板名称 |
| value_json | TEXT | 工作流具体配置 JSON |
| created_at | TEXT | 创建时间 |
| updated_at | TEXT | 更新时间 |

### 4. `app_kv` (通用键值存储)
用于存储单值状态，如 `activeWorkflowId` 或迁移进度。

### 5. `migrations` (版本管理)
记录数据库结构变更。

## 注意事项
- **禁止提交**: `server/data/project.db` 已通过 `.gitignore` 排除，禁止提交。
- **Yjs 持久化**: 画布协作状态仍由 `server/data/yjs-docs` (LevelDB) 管理，暂不进入 SQLite，保持解耦。
- **CJS 模块**: 为保证后端启动兼容性，store 采用 `.cjs` 扩展名。
- **事务并发**: 基于 `WAL` 模式，支持高性能并发读取。
