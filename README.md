# 面经复盘 · Interview Retro

一个本地优先的个人面试复盘工具：记录每场面试被问到的题、当时怎么答的、复盘后的正确思路，然后按间隔重复定期复习。

更重要的是——**它是为扩展而设计的**。核心只定义稳定接口，插件可以在不改动任何核心文件的前提下增加导出格式、导入器、UI 页面、替换存储后端或复习算法。

## 功能

- **场次管理**：按公司 / 岗位 / 轮次 / 结果记录每场面试，题目挂到场次下
- **三段式复盘**：`myAnswer`（当时原样回答）/ `idealAnswer`（正确思路）/ `lesson`（踩坑点）分开存
- **间隔重复复习**：默认阶梯 1/3/7/15/30/60 天，记住了拉长间隔，没记住打回第一轮
- **检索与统计**：全文搜索、分类 / 掌握度筛选、低分题优先、知识点分布
- **数据安全**：纯本地存储，JSON 全量导入导出（含插件配置）
- **插件系统**：12 个扩展点，类型安全，源码内注册，零运行时风险

## 快速开始

需要 Node.js 20+。

```bash
npm ci
npm run dev        # 前端开发服务器，默认 http://localhost:5173
npm test           # vitest 单测（前端数据层 + 后端）
npm run typecheck  # 前端类型检查（vue-tsc）
npm run typecheck:server  # 后端独立类型检查（vue-tsc 不覆盖 server/）
npm run build      # 类型检查 + 生产构建，产物在 dist/
npm run preview    # 本地预览构建产物
npm run dev:server # 后端开发服务，默认 http://127.0.0.1:3001
```

`dist/` 是纯静态产物，使用 hash 路由，**不需要服务端 rewrite 配置**。但部署到子路径（例如 GitHub Pages 的 `https://<user>.github.io/<repo>/`）时必须指定资源前缀，否则 `/assets/*` 会 404：

跨平台最省事的做法是在项目根目录建 `.env.production`：

```dotenv
VITE_BASE=/<repo>/
```

之后直接 `npm run build`。也可以用环境变量（Windows Git Bash 需要禁止 MSYS 路径转换，否则 `/<repo>/` 会被改写成盘符路径）：

```bash
VITE_BASE=/<repo>/ npm run build
# Windows Git Bash：
MSYS_NO_PATHCONV=1 VITE_BASE=/<repo>/ npm run build
```

配置层会校验 `VITE_BASE`：值不像合法子路径时回退 `/` 并给出警告。部署在域名根路径时无需设置。

## 后端与云同步（Stage 3–4）

前端仍然是**本地优先、可离线独立运行**的纯静态产物：不登录时数据只存浏览器；登录后通过内置 `cloud-sync` 插件做**增量云同步**（字段级 LWW 合并），断网时本地照常用，恢复后自动补齐。

复制 `.env.example` 为 `.env` 后即可启动（不复制也能跑，全部变量都有安全默认值；`JWT_SECRET` 生产必填）：

```bash
npm run dev:server   # tsx watch，改代码自动重启
npm run start:server # 一次性启动
curl http://127.0.0.1:3001/health
curl http://127.0.0.1:3001/ready
```

| 端点                        | 说明                                                         |
| --------------------------- | ------------------------------------------------------------ |
| `GET /health`               | 进程存活，不查数据库；返回版本与运行时长                     |
| `GET /ready`                | 数据库连通且迁移已应用；失败返回 503                         |
| `POST /api/auth/register`   | 注册并自动登录；密码用 scrypt 哈希，绝不存明文               |
| `POST /api/auth/login`      | 登录，返回 15 分钟访问令牌（JWT）+ HttpOnly 刷新 Cookie      |
| `POST /api/auth/refresh`    | 轮换刷新令牌并签发新访问令牌；旧令牌复用会撤销该用户全部会话 |
| `POST /api/auth/logout`     | 幂等登出，撤销刷新令牌                                       |
| `POST /api/sync/push`       | 批量推送变更（按 `changeId` 幂等，重试安全）                 |
| `GET /api/sync/pull?since=` | 按 `seq` 游标增量拉取变更                                    |

所有错误统一为 `{ "error": { "code", "message", "requestId" } }`，客户端永远拿不到堆栈或内部异常。结构化 JSON 日志带 `requestId`，请求序列化只保留 method / url / requestId，不记录 headers、令牌与隐私数据。`/api/auth/*` 有每分钟每 IP 限流。

**分层约定**：`server/modules/*` 按 `controller → service → repository` 组织，控制器不写业务逻辑，服务层不 import HTTP 类型；`shared/api.ts` 是前后端共享的 DTO 与错误码（纯类型，无运行时依赖）；`shared/domain.ts` 是领域模型单一来源。配置集中在 `server/config/env.ts`，启动时用 zod 校验并快速失败，生产环境禁止 CORS 通配符、强制要求 `JWT_SECRET`。

**令牌安全**：访问令牌只放前端内存（刷新页面即失效，由刷新令牌静默续期）；刷新令牌是不透明随机值，服务端只存 SHA-256 hash，经 HttpOnly Cookie 流转，可主动撤销。密钥只出现在服务端 env，禁止写入 `VITE_*`。

**同步模型**：服务端是「哑变更日志」——`sync_changes`（append-only，`changeId` 幂等）+ `tombstones`（墓碑物化），不参与冲突合并；客户端把本地写入差分成字段级变更上传，拉取时按**字段级 LWW**（时间戳 + changeId 决胜）收敛，任意推送顺序都得到同一状态。前端入口是 `useAsyncStorageAdapter` 注入的混合云适配器（未登录时等价于纯 localStorage），30s 轮询 + 写后防抖推送 + 离线队列。

**数据库**：Drizzle + libSQL（SQLite）。`npm run db:generate` 根据 `server/db/schema.ts` 生成可审查、可回滚的 SQL 到 `server/db/migrations/`，服务启动期自动执行未应用的迁移（幂等）。迁移 0000 建 `users` / `refresh_tokens`，迁移 0001 建 `sync_changes` / `tombstones`。本地数据文件默认在 `server/data/`，已被忽略。

## 数据存在哪

数据保存在浏览器 `localStorage`；登录后会增量同步到后端（见上一节）。这意味着：

- 清除浏览器数据 / 换浏览器 / 换电脑 / 无痕模式 → 未登录时数据会丢失，**请定期在「数据与备份」页导出 JSON**；已登录用户可在新设备登录后自动拉回
- 本地存储写入失败或数据解析损坏时，顶部会显示告警；损坏数据会另存一份原始副本，可下载后人工恢复，**不要直接继续录入**，否则后续写操作会覆盖它
- 容量上限约 5 MB；题量上万或需要全文索引时，可换 IndexedDB 存储适配器（见下方约束说明）
- 导入是整包覆盖，操作前会二次确认
- 部署成公开链接时，每个访客各自保存自己的数据，不会互相看到

## 项目结构

```
shared/
├── domain.ts          领域模型单一来源（前后端共享，src/types 从这里 re-export）
└── api.ts             API DTO 与规范化错误码（纯类型，无运行时依赖）
server/
├── config/env.ts      环境变量集中校验，启动快速失败
├── core/validate.ts   边界输入校验
├── errors/            类型化 AppError + 全局错误处理器
├── db/                Drizzle schema / 连接 / 可回滚 SQL 迁移
├── http/              结构化日志 / 安全头 / CORS 白名单
├── modules/health/    controller → service → repository 三层示例
├── app.ts             应用组装（依赖注入，便于 inject 测试）
├── lifecycle.ts       优雅停机（顺序 / 幂等 / 超时兜底）
└── index.ts           启动入口
src/
├── sdk/               对外稳定契约（第三方插件只依赖这里）
│   ├── types.ts          Plugin / 事件表 / 适配器 / UI 插槽等全部公共类型
│   ├── define-plugin.ts  带类型推导的插件定义辅助
│   ├── settings.ts       供 UI 插槽读取插件配置的辅助函数
│   └── index.ts          统一出口
├── core/extensions/   插件内核（内部实现）
│   ├── registry.ts       注册表 / 扩展点容器 / bootstrap
│   ├── event-bus.ts      类型安全的生命周期事件总线
│   ├── local-storage-adapter.ts   默认存储适配器
│   ├── default-review-strategy.ts 默认复习策略
│   └── disabled-ai-adapter.ts     默认禁用 AI 适配器
├── plugins/           插件注册入口 + 内置示例
│   ├── index.ts         ★ 使用者扩展时唯一需要改的文件
│   └── components/      示例插件的 Vue 组件
├── types/             领域类型兼容层（保持 @/types 路径不变）
├── services/          storage / repository / backup / ai / storage-gateway / storage-queue
├── stores/            Pinia 状态（含启动期预加载 initializeStores）
├── views/             页面
└── components/        通用组件与布局
```

## 扩展系统

### 设计原则

1. **核心只认接口**：`src/sdk/types.ts` 是稳定公共契约，核心代码通过注册表拿实现，不 import 任何插件。
2. **插件是普通 TS 模块**：在 `src/plugins/index.ts` 里注册，构建期就能查出接口用错，没有远程脚本、没有 `eval`、没有供应链风险。
3. **加法型共存，替换型覆盖**：格式 / 插槽 / 事件可多插件共存；适配器 / 策略后注册者生效。
4. **错误隔离**：事件处理器与 `setup` 抛错都会被捕获；所有 UI 插槽和插件路由由 `PluginBoundary` 包裹，组件渲染异常只显示一张错误卡片，不会让应用白屏；`app.config.errorHandler` 作为最后兜底。

### 扩展点总览

| 扩展点         | 注册方法                    | 作用                                         | 类型 |
| -------------- | --------------------------- | -------------------------------------------- | ---- |
| 事件订阅       | `events.on(...)`            | 监听生命周期、插件间通信                     | 加法 |
| 存储适配器     | `useStorageAdapter`         | 替换底层持久化（同步契约，保持不变）         | 替换 |
| 异步存储适配器 | `useAsyncStorageAdapter`    | IndexedDB / 远端同步；注册后优先于同步适配器 | 替换 |
| AI 适配器      | `useAiAdapter`              | 接入大模型复盘                               | 替换 |
| 复习策略       | `useReviewStrategy`         | 替换整个间隔算法                             | 替换 |
| 导出格式       | `registerExporter`          | 设置页新增导出按钮                           | 加法 |
| 导入格式       | `registerImporter`          | 设置页新增导入按钮                           | 加法 |
| 菜单项         | `registerMenuItem`          | 侧边栏新增入口                               | 加法 |
| 页面路由       | `registerRoute`             | 注册独立页面                                 | 加法 |
| 总览卡片       | `registerDashboardWidget`   | 总览页新增卡片                               | 加法 |
| 题目面板       | `registerQuestionDetailTab` | 单题页新增 Tab                               | 加法 |
| 设置面板       | `registerSettingsPanel`     | 设置页新增面板                               | 加法 |

另外两个数据扩展位：`Interview.metadata` / `Question.metadata` 供插件存自定义字段（核心不解释、只透传）；`ctx.settings` 提供按插件 id 隔离的持久化配置，并随 JSON 备份一起导出。

### 5 分钟写第一个插件

新建 `src/plugins/my-plugin.ts`：

```ts
import { definePlugin } from '@/sdk'

export default definePlugin({
  manifest: {
    id: 'me:my-plugin', // 建议 namespace:name，全局唯一
    name: '我的插件',
    version: '1.0.0',
    description: '新题录入时打个标记',
    contributes: ['event'], // 声明用到的扩展点，设置页会展示
  },

  setup({ events, log, settings }) {
    // 事件名和 payload 都有类型提示，写错会编译报错
    events.on('question:created', (question) => {
      log('新题：', question.content)

      // 插件自己的配置，按 manifest.id 隔离
      const count = settings.get<number>() ?? 0
      settings.set(count + 1)
    })

    events.on('plugin:message', ({ from, type }) => {
      log(`收到 ${from} 的 ${type} 消息`)
    })
  },
})
```

在 `src/plugins/index.ts` 里加一行：

```ts
import myPlugin from './my-plugin'

export const plugins: Plugin[] = [, /* 内置插件 */ myPlugin]
```

刷新页面，打开「数据与备份 → 扩展管理」就能看到它。注释掉这一行，或在面板里关闭开关（刷新后生效），即可卸载。

### 生命周期事件

| 事件                                        | payload                                    | 触发时机           |
| ------------------------------------------- | ------------------------------------------ | ------------------ |
| `app:ready`                                 | 无                                         | 全部插件安装完成后 |
| `interview:created` / `updated` / `deleted` | `Interview` / `{ id }`                     | 场次增删改         |
| `question:created` / `updated` / `deleted`  | `Question` / `{ id }`                      | 题目增删改         |
| `review:completed`                          | `{ questionId, remembered, nextReviewAt }` | 复习打卡           |
| `data:imported` / `data:exported`           | `{ interviews, questions }`                | 备份导入导出       |
| `data:cleared`                              | 无                                         | 清空数据           |
| `plugin:message`                            | `{ from, type, payload }`                  | 插件间自定义通信   |

`void` 事件调用 `events.emit('data:cleared')` 无需传 payload，其余事件必须传，编译期校验。新增事件只做加法，不修改已有 payload 结构。

### 各类扩展点用法

**导出格式**（设置页自动出现按钮，核心负责触发下载）：

```ts
setup({ registerExporter }) {
  registerExporter({
    id: 'anki-csv',
    label: '导出 Anki CSV',
    extension: 'csv',
    run({ questions, today }) {
      const rows = questions.map(q => `"${q.content}","${q.idealAnswer}"`)
      return {
        filename: `anki-${today}.csv`,
        content: ['Front,Back', ...rows].join('\n'),
        mimeType: 'text/csv;charset=utf-8',
      }
    },
  })
}
```

**导入格式**（返回输入对象即可，id / 时间戳 / 首次复习日期由核心补齐）：

```ts
setup({ registerImporter }) {
  registerImporter({
    id: 'jsonl', label: 'JSONL 题目', accept: '.jsonl',
    parse(text) {
      const questions = text.split('\n').filter(Boolean).map(line => ({
        interviewId: null,
        content: (JSON.parse(line) as { q: string }).q,
        category: 'tech' as const, tags: [], difficulty: 3 as const,
        myAnswer: '', idealAnswer: '', lesson: '',
        selfRating: 3 as const, mastery: 'unknown' as const,
      }))
      return { questions }
    },
  })
}
```

**替换存储适配器**（只负责原始字符串读写，JSON 解析与版本迁移仍由核心处理）：

```ts
setup({ useStorageAdapter }) {
  useStorageAdapter({
    id: 'me:session', label: '会话级存储',
    read: () => sessionStorage.getItem('interview-retro:state'),
    write: raw => sessionStorage.setItem('interview-retro:state', raw),
    clear: () => sessionStorage.removeItem('interview-retro:state'),
  })
}
```

> 同步适配器**零改动仍可用**：核心会通过 `storage-gateway` 自动把它包装成 Promise。
> 同步适配器适合做加密 / 压缩、分片存储、多工作区 key、写入前钩子。
> 需要 IndexedDB / 远端同步时改注册 `AsyncStorageAdapter`（`read / write / clear` 返回 `Promise`），
> 网关会优先使用它；两类适配器同时注册时以异步为准。

```ts
setup({ useAsyncStorageAdapter }) {
  useAsyncStorageAdapter({
    id: 'me:cloud', label: '云同步',
    async read() { /* 返回原始字符串或 null */ return await remote.get() },
    async write(raw) { await remote.set(raw) },
    async clear() { await remote.clear() },
  })
}
```

> 数据层已统一为 async 链路，复合「读→改→写」由 `withStorageLock` 串行化避免并发覆盖；
> 适配器的 `read / write` 里不要再回调核心仓储，否则会与锁互相等待。适配器抛错由核心统一吞掉并上报 `storage-health`，不会冒泡到页面。

**替换 AI 适配器**（密钥必须放后端代理，禁止写进 `import.meta.env`）：

```ts
setup({ useAiAdapter }) {
  useAiAdapter({
    id: 'me:http-ai', label: '我的 AI 复盘',
    async review(req) {
      const res = await fetch('/api/ai/review', {
        method: 'POST', body: JSON.stringify(req),
      })
      return res.json()  // { idealAnswer, suggestedTags, suggestions }
    },
  })
}
```

**替换复习策略**（例如换成完整 SM-2 或 FSRS）：

```ts
setup({ useReviewStrategy }) {
  useReviewStrategy({
    id: 'me:fsrs', label: 'FSRS',
    computeNext(question, remembered, settings) {
      return {
        reviewCount: question.reviewCount + 1,
        lastReviewedAt: new Date().toISOString(),
        nextReviewAt: addDays(todayISO(), remembered ? 10 : 1),
      }
    },
  })
}
```

`ReviewPlan` 还可以返回可选的 `mastery` 字段，让策略自行决定「何时算掌握」；不返回时沿用核心默认规则（连续 3 次记住即标为已掌握），因此旧插件无需改动即可兼容。

**UI 插槽**（`component` 是 Vue 组件，核心通过 `PluginBoundary` 渲染并隔离异常）：

```ts
import MyPage from './MyPage.vue'

setup({ registerMenuItem, registerRoute, registerDashboardWidget,
        registerQuestionDetailTab, registerSettingsPanel }) {
  registerMenuItem({ id: 'me:menu', label: '我的页面', path: '/my-page' })
  registerRoute({ path: '/my-page', name: 'me-my-page', title: '我的页面', component: MyPage })
  registerDashboardWidget({ id: 'me:widget', title: '统计卡片', component: MyWidget })
  registerSettingsPanel({ id: 'me:panel', title: '插件设置', component: MyPanel })
  registerQuestionDetailTab({ id: 'me:tab', label: '扩展信息', component: MyTab })
}
```

- `registerMenuItem` 与 `registerRoute` 一般成对使用；路由会挂到名为 `root` 的父路由下
- `questionDetailTab` 的组件会收到一个 `question` prop（当前题目）
- 插槽组件可以直接 `import { useQuestionStore } from '@/stores/question'` 拿响应式数据
- 需要读插件配置时用 `getPluginSettings<T>('me:my-plugin')`（非响应式快照，建议 `onMounted` 时读取）

### 约束与约定

- **只改 `src/plugins/index.ts`**：这是扩展者唯一需要修改的核心仓库文件，方便 fork 后合并上游更新。
- **id 带命名空间**：`namespace:name`，注册表对重复 id 会告警并忽略。
- **后注册覆盖**：替换型扩展点的生效者由 `plugins` 数组顺序决定，设置页会显示当前是谁。
- **开关刷新生效**：启用 / 禁用状态持久化在独立 key，不做热卸载（避免动态路由残留）。
- **启动顺序**：`bootstrapExtensions`（等所有插件含异步 `setup` 注册完 → `addRoute` → 广播 `app:ready`）→ `initializeStores()` 预加载首屏数据 → `app.use(router)` → `mount`。存储层是 async 的，store 的 setup 不再同步读盘；预加载必须在首次导航前完成，否则首屏会先闪一下空列表。`app:ready` 在应用挂载前触发，插件不要在此时操作 DOM。
- **单个插件异常被隔离**：事件处理器、`setup`、插槽组件渲染三层都有兜底，单个插件故障不影响其他功能。
- **SDK 稳定性**：`src/sdk/` 中已导出的类型签名保持不变即视为兼容；新增扩展点或可选字段是非破坏性变更。请不要直接 import `src/core/` 内部模块。

## 内置示例插件

| 插件                      | 演示的扩展点                       | 作用                             |
| ------------------------- | ---------------------------------- | -------------------------------- |
| `builtin:markdown-export` | exporter                           | 导出按分类分组的 Markdown 笔记   |
| `builtin:text-import`     | importer                           | 每行一题，批量导入纯文本面经     |
| `builtin:tag-cloud`       | dashboardWidget / menuItem / route | 高频知识点统计，含独立页面       |
| `builtin:review-log`      | event / settingsPanel              | 订阅打卡事件，记录最近 50 次复习 |

这 4 个插件本身也是可读的范例代码，建议从它们开始改。

## 备份格式

导出的 JSON 结构：

```json
{
  "app": "interview-retro",
  "schemaVersion": 1,
  "exportedAt": "2026-11-11T03:00:00.000Z",
  "interviews": [],
  "questions": [],
  "settings": { "reviewIntervals": [1, 3, 7, 15, 30, 60], "dailyReviewLimit": 20 },
  "pluginSettings": {}
}
```

`schemaVersion` 由 `src/services/storage.ts` 的 `migrate()` 负责升级；`pluginSettings` 可选，旧版备份没有也能正常导入。

## 路线图

- P1：Markdown 渲染与代码高亮、面经文本解析增强、按公司 / 岗位统计
- P2：~~异步存储适配器~~ **已完成**（`AsyncStorageAdapter` + 统一异步网关，repository / stores 已 async 化）；全文检索待做
- P3：官方 AI 复盘插件（后端代理保管密钥）
- P4：~~多端同步（账号 + 增量同步）~~ **已完成**（scrypt + JWT 鉴权、`/api/sync/*`、字段级 LWW、离线队列、30s 轮询）；剩余：同步冲突的可视化 diff、日志压缩

## 常见问题

**构建后有个 900KB+ 的 chunk？** 是 Element Plus 全量引入，刻意选择：单人本地应用首屏 gzip 约 350KB 可接受，换来零构建插件依赖。要压到约 100KB，可安装 `unplugin-vue-components` + `ElementPlusResolver` 改按需引入。

**为什么用 hash 路由？** 静态托管不需要服务端 rewrite，本地双击 `dist/index.html` 也能打开。换 history 模式需配置 SPA fallback。

**CI 跑什么？** `.github/workflows/ci.yml` 在 push / PR 时执行 `npm ci` → `npm run typecheck` → `npm run typecheck:server` → `npm test` → `npm run build`，防止第三方 PR 破坏构建。

## 许可证

[MIT](./LICENSE) © 2026 许安
