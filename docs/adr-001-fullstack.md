# ADR-001 · 全栈化架构决策

> 状态：**已确认，分阶段实施中**。Stage 0（版本控制基线）已完成，Stage 1（测试安全网）进行中。
> 本文只记录架构决策与约束，不含任何密钥、凭证或本机专属配置。

## 背景

项目最初是纯前端单机应用：Vue 3 + Vite + TypeScript + Pinia，数据存浏览器本地存储，JSON 全量导入导出是唯一备份。核心价值不在 CRUD，而在**插件扩展体系**：`src/sdk/` 是稳定公共契约，11 个扩展点允许第三方在不改核心文件的前提下替换存储后端、AI 适配器、复习策略，或增加导入导出格式与 UI 插槽。

全栈化的目标是在**不推倒这套插件体系**的前提下，加入账号、多端同步与后端 AI 代理。

## 1. 已确认的四项决策

1. **全栈形态：本地优先 + 云同步**。保留本地单机全功能，登录后增量同步；离线可用，静态 Demo 不受影响。
2. **技术栈：Node + TypeScript + Drizzle ORM**。本地开发用 SQLite，生产可切 PostgreSQL；保留纯本地离线模式作为默认可回退路径。
3. **部署：前端纯静态产物 + 后端独立部署**。前端可推 GitHub Pages 作在线 Demo，后端单独托管；CORS 使用显式来源白名单。
4. **工程质量：vitest + ESLint/Prettier 分阶段加入**，CI 最终扩成 lint + test + typecheck + build。

## 2. Phase 1 五项架构决策

| 决策 | 结论 | 理由 |
|---|---|---|
| 项目结构 | 保持 `src/` 原地不动，新增平级 `server/`（按功能分 auth / sync / ai / health）与 `shared/`（领域类型 + DTO + 错误码） | 不搬迁前端目录，README 中所有路径与插件示例继续有效；后端按功能组织，controller → service → repository 三层 |
| API 客户端 | 类型化 fetch 封装（不引 React Query / tRPC），Base URL 走环境变量 | 前端是 Vue + Pinia，现有 store 可直接承载加载与错误态；跨端类型靠 `shared/` 共享 |
| 认证策略 | JWT 访问令牌 15min 只放内存 + 刷新令牌 HttpOnly / Secure / SameSite=Strict Cookie，服务端存 hash 可撤销；401 自动刷新重试一次；单用户起步，RBAC 留接口 | 令牌不落本地存储、不进 URL；刷新令牌可服务端作废 |
| 实时方案 | 页面可见时 30s 轮询 + 手动同步起步，后置 SSE（只推「有变更」信号，收到再 pull）；不引 WebSocket | 单人私用、同步频率低，SSE 单向且自动重连、走 HTTP 兼容跨域 |
| 错误处理 | 后端类型化 `AppError(code, status)` + 全局中间件，统一 `{ error: { code, message, requestId } }`；结构化 JSON 日志带 requestId，不记令牌与隐私数据。前端 4xx 映射可读文案且不重试，5xx 指数退避最多 3 次，网络失败显示离线提示并回落本地模式 | 客户端永不看到堆栈，离线优先语义与错误态一致 |

## 3. 不可破坏的契约

### 3.1 SDK 与插件体系

- **不改** `StorageAdapter` 的同步签名（`read(): string | null` / `write(raw): void` / `clear(): void`）。SDK 承诺「已导出类型签名不变即兼容」。
- **新增** 可选 `AsyncStorageAdapter` 与 `useAsyncStorageAdapter`，注册表同时持有两者；统一异步 `PersistenceGateway` 把旧同步适配器自动包成 Promise，旧插件零改动仍可用。
- `repository / stores / backup` 切到同一条 async 链路，不维护两套实现；`migrate()`、备份校验、`insertMany` 批量写入继续留在核心。
- 启动顺序保持 `createPinia → await bootstrapExtensions → app.use(router) → mount`。bootstrap 本就等待所有插件（含异步 setup），云适配器可在此完成首次拉取，无白屏竞态。
- 插件 UI 插槽与路由一律经 `PluginBoundary`；事件、导出导入格式、复习策略等扩展点行为不变。
- **后端能力必须经 `useAsyncStorageAdapter` / `useAiAdapter` 注入，页面里禁止直接 fetch 业务数据。**

### 3.2 数据归属与备份兼容

- `ownerId` 只存在服务端表与同步层，**不进前端 `Interview` / `Question` 类型，不进 `BackupPayload` 必填字段**。`parseBackup` 只强校验 `app / interviews / questions / schemaVersion`，增加必填字段会让所有旧备份失效。
- `SCHEMA_VERSION` 保持 1；将来确需前端携带归属字段时再 +1，并在 `migrate()` 补分支。`migrate()` 用宽容展开，未知字段天然透传。
- 导出 JSON 继续包含 `metadata` 与 `pluginSettings`。
- `core/extensions/registry.ts` 的插件启用状态与插件配置目前直接读写浏览器本地存储、不走适配器，云同步时需单独纳入同步范围或明确声明「仅本地」。

### 3.3 冲突与离线

- 以 `updatedAt` 做**字段级 LWW**，避免两端各改不同字段时互相抹掉。
- 物理删除用 tombstone 表；**「删场次不删题、只置空 `interviewId`」是 `update`，天然兼容，不需要墓碑**。
- 离线写操作进本地 `pending_changes` 队列，联网后带 `changeId` 幂等 push；服务端按 `changeId` 去重。
- 业务写入统一走 `/api/sync/push`，不另开一套 REST CRUD 写端点，避免双写导致冲突策略分叉。

### 3.4 构建与类型检查边界

- 根 `tsconfig.json` 的 `include` 只覆盖 `src/` 与 `vite.config.ts`，`vue-tsc --noEmit` **不会检查 `server/` 与 `shared/`**；CI 必须新增 `typecheck:server`（独立 `server/tsconfig.json`）。
- 前端引用 `shared/` 需新增 `@shared/*` alias 并同步 `tsconfig.paths`。
- 领域类型抽到 `shared/domain.ts`，`src/types/index.ts` 改为 re-export —— 对外 `@/types` 路径与 SDK 签名不变。

## 4. 端点草案

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/auth/register` `/login` `/refresh` `/logout` | 刷新令牌走 Cookie，logout 服务端撤销 |
| GET | `/api/sync/pull?since=<iso>` | 增量变更 + tombstones + serverTime |
| POST | `/api/sync/push` | 批量变更，`changeId` 幂等，返回 applied / conflicts |
| GET | `/api/sync/events` | SSE 变更信号（后置） |
| POST | `/api/ai/review` | 后端代理，密钥只在服务端 env；限流 |
| GET | `/health` `/ready` | 存活 / 就绪（含数据库连通性） |
| GET | `/api/backup/export` | 可选：服务端备份下载，与前端 JSON 格式一致 |

## 5. 环境变量

服务端：`PORT` `NODE_ENV` `DATABASE_URL` `JWT_ACCESS_SECRET` `JWT_REFRESH_SECRET` `ACCESS_TOKEN_TTL` `REFRESH_TOKEN_TTL` `CORS_ORIGINS` `AI_API_KEY` `AI_BASE_URL` `AI_MODEL` `RATE_LIMIT_MAX` `LOG_LEVEL`。

前端只需一个非密钥项 `VITE_API_BASE_URL`（默认同源 `/api`，开发用 Vite proxy 避免 CORS）。**任何 AI 密钥禁止写入 `import.meta.env` / `VITE_*`**。只提交 `.env.example`（占位值），真实 `.env` 一律不入库。

## 6. 分阶段计划

| Stage | 内容 | 验收 |
|---|---|---|
| 0 | 版本控制基线：初始化仓库、基线提交与 tag、CI | 可回滚基线，CI 全绿 |
| 1 | vitest 安全网：覆盖 `storage/migrate`、`parseBackup`、`repository`；CI 加 test | `npm test` + typecheck + build |
| 2 | `shared/` 类型抽取 + `PersistenceGateway` async 化 + 本地适配器可回退 | 三件套全绿，本地模式行为零变化 |
| 3 | 后端骨架：集中配置校验 / 错误体系 / JSON 日志 / 迁移与连接池 / health·ready / CORS / 安全头 / 优雅停机 | curl 冒烟 + `typecheck:server` |
| 4 | 鉴权 + push/pull 同步 + 字段级 LWW + 离线队列 + 轮询 | 双端增量同步、断网写入恢复 |
| 5 | `/api/ai/review` 代理 + `useAiAdapter` 插件（默认仍禁用） | 密钥不出现在前端产物 |
| 6 | 类型化 API 客户端 + 加载/错误/离线态 + ESLint/Prettier + SSE 后置 | CI 四项全绿 |
| 7 | Pages workflow + 在线 Demo + README 全栈章节 + 后端部署 | 静态 Demo 可访问，生产 CORS 非通配符 |

**横切规则**：每步一个提交，每步单独跑 typecheck + build（Stage 1 起加 `npm test`，Stage 3 起加 `typecheck:server`）；一个 Stage 不绿不进下一个；新增依赖先列清单与用途再安装。

**Stage 3 环境风险**：SQLite 驱动若是原生模块，在部分环境可能缺构建工具；踩坑时改用纯 JS 的 libSQL 驱动（Drizzle 同样支持）。

## 7. 不阻塞的遗留

GitHub Pages workflow、在线 Demo / 截图 / 示例数据、CONTRIBUTING 与 Issue·PR 模板、`PluginManifest` 版本兼容字段、SDK 独立发包（当前 `private: true` + 源码内注册，第三方只能 fork）、`ImportedData` 拿不到新建场次 id 导致批量导入无法关联、Element Plus 按需引入压体积。
