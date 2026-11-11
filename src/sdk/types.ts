/**
 * 对外稳定契约（Public SDK）
 *
 * 第三方插件只应 import 本目录下的类型与函数，不要直接依赖 src/core/ 内部实现。
 * 语义化版本约定：本文件中已导出的类型签名保持不变即视为兼容；
 * 新增扩展点或新增可选字段是非破坏性变更。
 *
 * 四类扩展点：
 * 1. 事件钩子   events（生命周期订阅 / 插件间消息）
 * 2. 可替换适配器 storageAdapter / aiAdapter / reviewStrategy
 * 3. 数据格式   exporter / importer
 * 4. UI 插槽     menuItem / route / dashboardWidget / questionDetailTab / settingsPanel
 */
import type { Component } from 'vue'
import type {
  AppSettings,
  ISODate,
  Interview,
  InterviewInput,
  MasteryLevel,
  Question,
  QuestionInput,
} from '@/types'

export type {
  AppSettings,
  ISODate,
  ISODateTime,
  Interview,
  InterviewInput,
  InterviewResult,
  InterviewRound,
  Question,
  QuestionInput,
  QuestionCategory,
  MasteryLevel,
  Difficulty,
  SelfRating,
  PersistedState,
  BackupPayload,
} from '@/types'

/** 插件可贡献的扩展点标识，用于 manifest 声明与设置页展示 */
export type ExtensionPoint =
  | 'event'
  | 'storageAdapter'
  | 'aiAdapter'
  | 'reviewStrategy'
  | 'importer'
  | 'exporter'
  | 'menuItem'
  | 'route'
  | 'dashboardWidget'
  | 'questionDetailTab'
  | 'settingsPanel'

export interface PluginManifest {
  /** 全局唯一，建议 namespace:name，例如 acme:markdown-export */
  id: string
  name: string
  /** 遵循语义化版本 semver */
  version: string
  description?: string
  author?: string
  homepage?: string
  /** 声明用到的扩展点，设置页会展示；缺省时由注册表自动推断 */
  contributes?: ExtensionPoint[]
}

/**
 * 生命周期事件表。
 * 需要插件间自定义通信时用 'plugin:message'，payload 里带 from/type 自行区分。
 * 新增事件只做加法，不修改已有事件的 payload 结构。
 */
export interface AppEvents {
  'app:ready': void
  'interview:created': Interview
  'interview:updated': Interview
  'interview:deleted': { id: string }
  'question:created': Question
  'question:updated': Question
  'question:deleted': { id: string }
  'review:completed': {
    questionId: string
    remembered: boolean
    nextReviewAt: ISODate | null
  }
  'data:imported': { interviews: number; questions: number }
  'data:exported': { interviews: number; questions: number }
  'data:cleared': void
  'plugin:message': { from: string; type: string; payload: unknown }
}

export type EventHandler<T> = (payload: T) => void

export interface EventBus {
  on<K extends keyof AppEvents>(event: K, handler: EventHandler<AppEvents[K]>): () => void
  off<K extends keyof AppEvents>(event: K, handler: EventHandler<AppEvents[K]>): void
  once<K extends keyof AppEvents>(event: K, handler: EventHandler<AppEvents[K]>): () => void
  /** void 事件无需传 payload，其余事件必须传，编译期即可校验 */
  emit<K extends keyof AppEvents>(
    event: K,
    ...args: AppEvents[K] extends void ? [] : [AppEvents[K]]
  ): void
  onAny(handler: (event: string, payload: unknown) => void): () => void
}

/** 只负责「原始字符串」读写，JSON 解析与版本迁移仍由核心负责 */
export interface StorageAdapter {
  readonly id: string
  readonly label: string
  read(): string | null
  write(raw: string): void
  clear(): void
}

export interface AiReviewRequest {
  content: string
  myAnswer: string
  category: string
  tags?: string[]
}

export interface AiReviewResponse {
  idealAnswer: string
  suggestedTags: string[]
  suggestions: string[]
}

export interface AiAdapter {
  readonly id: string
  readonly label: string
  review(req: AiReviewRequest): Promise<AiReviewResponse>
  chat?(messages: { role: 'user' | 'assistant'; content: string }[]): Promise<string>
}

export interface ReviewPlan {
  reviewCount: number
  lastReviewedAt: string | null
  nextReviewAt: ISODate | null
  /**
   * 可选：由策略自行决定掌握度，从而完整接管「何时算掌握」的规则。
   * 不返回时沿用核心默认规则（连续 3 次记住即标为已掌握），保证旧插件兼容。
   */
  mastery?: MasteryLevel
}

/** 替换整个复习算法，例如接入完整 SM-2 / FSRS */
export interface ReviewStrategy {
  readonly id: string
  readonly label: string
  computeNext(question: Question, remembered: boolean, settings: AppSettings): ReviewPlan
}

export interface ExportContext {
  interviews: Interview[]
  questions: Question[]
  settings: AppSettings
  /** 导出时的本地日期 YYYY-MM-DD */
  today: ISODate
}

export interface ExportResult {
  filename: string
  content: string
  mimeType: string
}

export interface ExportFormat {
  id: string
  label: string
  description?: string
  /** 文件扩展名，不含点，例如 md */
  extension: string
  run(ctx: ExportContext): ExportResult
}

export interface ImportContext {
  settings: AppSettings
}

/** 返回「输入对象」即可，id 与时间戳由核心补齐，插件无需关心存储细节 */
export interface ImportedData {
  interviews?: InterviewInput[]
  questions?: QuestionInput[]
}

export interface ImportFormat {
  id: string
  label: string
  /** 用于 input[accept]，例如 .txt,.md */
  accept: string
  description?: string
  parse(text: string, ctx: ImportContext): ImportedData
}

/** UI 插槽：component 为 Vue 组件，核心通过 PluginBoundary 渲染并隔离渲染异常 */
export interface DashboardWidget {
  id: string
  title: string
  component: Component
}

export interface SettingsPanel {
  id: string
  title: string
  component: Component
}

/** component 会收到一个 question prop（当前题目） */
export interface QuestionDetailTab {
  id: string
  label: string
  component: Component
}

export interface MenuItemExtension {
  id: string
  label: string
  /** hash 路由路径，例如 /tag-cloud；同时需要 registerRoute 注册对应页面 */
  path: string
}

export interface RouteExtension {
  path: string
  name: string
  component: Component
  title?: string
}

/** 当前插件专属配置（注册表按 manifest.id 隔离，插件无需自己拼 key） */
export interface PluginSettingsApi {
  get<T>(): T | null
  set<T>(value: T): void
}

/**
 * setup() 期间拿到的上下文。所有注册方法都是「加法」，
 * 适配器类方法（useXxx）是「替换」，后安装的插件覆盖先安装的，设置页会显示当前生效者。
 */
export interface PluginContext {
  readonly events: EventBus
  readonly log: (...args: unknown[]) => void
  readonly settings: PluginSettingsApi
  registerExporter(format: ExportFormat): void
  registerImporter(format: ImportFormat): void
  registerDashboardWidget(widget: DashboardWidget): void
  registerSettingsPanel(panel: SettingsPanel): void
  registerQuestionDetailTab(tab: QuestionDetailTab): void
  registerMenuItem(item: MenuItemExtension): void
  registerRoute(route: RouteExtension): void
  useStorageAdapter(adapter: StorageAdapter): void
  useAiAdapter(adapter: AiAdapter): void
  useReviewStrategy(strategy: ReviewStrategy): void
}

export interface Plugin {
  manifest: PluginManifest
  /** 安装期调用，在这里注册所有扩展点；可同步或异步 */
  setup(ctx: PluginContext): void | Promise<void>
  /** 可选：热卸载时清理副作用（当前版本刷新页面生效） */
  teardown?(): void
}
