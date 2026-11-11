import { defineComponent, h, type Component } from 'vue'
import type { Router } from 'vue-router'
import PluginBoundary from '@/components/common/PluginBoundary.vue'
import type {
  AiAdapter,
  AsyncStorageAdapter,
  DashboardWidget,
  EventBus,
  ExportFormat,
  ImportFormat,
  MenuItemExtension,
  Plugin,
  PluginContext,
  PluginManifest,
  QuestionDetailTab,
  ReviewStrategy,
  RouteExtension,
  SettingsPanel,
  StorageAdapter,
} from '@/sdk/types'
import { PLUGIN_SETTINGS_KEY, PLUGIN_STATE_KEY } from '@/constants'
import { createEventBus } from './event-bus'
import { localStorageAdapter } from './local-storage-adapter'
import { intervalReviewStrategy } from './default-review-strategy'
import { disabledAiAdapter } from './disabled-ai-adapter'

/**
 * 扩展点注册表（内核）。
 *
 * 设计约束：
 * - 注册表不 import 任何 store / view / plugin，避免循环依赖；
 *   插件列表由 main.ts 传入，插件组件可以反过来 import stores。
 * - 加法型扩展点（格式、插槽、事件）可多插件共存，id 重复会告警并忽略。
 * - 替换型扩展点（适配器、复习策略）后安装者覆盖前者，设置页展示当前生效者；
 *   同步 / 异步存储适配器是两张独立的表，网关优先取异步那张。
 * - 启用/禁用状态持久化在独立 key，切换后刷新页面生效（避免热卸载路由的复杂性）。
 */

export const events: EventBus = createEventBus()

interface RegistryState {
  plugins: Plugin[]
  exporters: ExportFormat[]
  importers: ImportFormat[]
  widgets: DashboardWidget[]
  panels: SettingsPanel[]
  tabs: QuestionDetailTab[]
  menuItems: MenuItemExtension[]
  routes: RouteExtension[]
  storageAdapter: StorageAdapter
  asyncStorageAdapter: AsyncStorageAdapter | null
  aiAdapter: AiAdapter
  reviewStrategy: ReviewStrategy
}

const state: RegistryState = {
  plugins: [],
  exporters: [],
  importers: [],
  widgets: [],
  panels: [],
  tabs: [],
  menuItems: [],
  routes: [],
  storageAdapter: localStorageAdapter,
  asyncStorageAdapter: null,
  aiAdapter: disabledAiAdapter,
  reviewStrategy: intervalReviewStrategy,
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    return JSON.parse(window.localStorage.getItem(key) ?? '') as T
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    console.warn(`[extensions] 无法持久化 ${key}`)
  }
}

let enabled = readJson<Record<string, boolean>>(PLUGIN_STATE_KEY, {})

export function isPluginEnabled(id: string): boolean {
  return enabled[id] !== false
}

export function setPluginEnabled(id: string, value: boolean): void {
  enabled = { ...enabled, [id]: value }
  writeJson(PLUGIN_STATE_KEY, enabled)
}

export function listPlugins(): { manifest: PluginManifest; enabled: boolean }[] {
  return state.plugins.map((plugin) => ({
    manifest: plugin.manifest,
    enabled: isPluginEnabled(plugin.manifest.id),
  }))
}

export function getExporters(): ExportFormat[] { return [...state.exporters] }
export function getImporters(): ImportFormat[] { return [...state.importers] }
export function getDashboardWidgets(): DashboardWidget[] { return [...state.widgets] }
export function getSettingsPanels(): SettingsPanel[] { return [...state.panels] }
export function getQuestionDetailTabs(): QuestionDetailTab[] { return [...state.tabs] }
export function getMenuItems(): MenuItemExtension[] { return [...state.menuItems] }

export function getStorageAdapter(): StorageAdapter { return state.storageAdapter }
export function getAsyncStorageAdapter(): AsyncStorageAdapter | null { return state.asyncStorageAdapter }
export function getAiAdapter(): AiAdapter { return state.aiAdapter }
export function getReviewStrategy(): ReviewStrategy { return state.reviewStrategy }

export function getActiveAdapters() {
  return {
    storage: state.storageAdapter,
    asyncStorage: state.asyncStorageAdapter,
    ai: state.aiAdapter,
    review: state.reviewStrategy,
  }
}

/** 插件配置按 id 隔离存放；备份导入导出会带走这整张表 */
export function readPluginSettings(): Record<string, unknown> {
  return readJson<Record<string, unknown>>(PLUGIN_SETTINGS_KEY, {})
}

export function writePluginSettings(all: Record<string, unknown>): void {
  writeJson(PLUGIN_SETTINGS_KEY, all)
}

function pushUnique<T extends { id: string }>(list: T[], item: T, kind: string): void {
  if (list.some((existing) => existing.id === item.id)) {
    console.warn(`[extensions] ${kind} id 重复，已忽略：${item.id}`)
    return
  }
  list.push(item)
}

function createContext(pluginId: string): PluginContext {
  return {
    events,
    log: (...args: unknown[]) => console.info(`[plugin:${pluginId}]`, ...args),
    settings: {
      get<T>(): T | null {
        return (readPluginSettings()[pluginId] as T) ?? null
      },
      set<T>(value: T): void {
        const all = readPluginSettings()
        all[pluginId] = value
        writePluginSettings(all)
      },
    },
    registerExporter: (format) => pushUnique(state.exporters, format, 'exporter'),
    registerImporter: (format) => pushUnique(state.importers, format, 'importer'),
    registerDashboardWidget: (widget) => pushUnique(state.widgets, widget, 'dashboardWidget'),
    registerSettingsPanel: (panel) => pushUnique(state.panels, panel, 'settingsPanel'),
    registerQuestionDetailTab: (tab) => pushUnique(state.tabs, tab, 'questionDetailTab'),
    registerMenuItem: (item) => pushUnique(state.menuItems, item, 'menuItem'),
    registerRoute: (route) => {
      if (state.routes.some((existing) => existing.name === route.name)) {
        console.warn(`[extensions] 路由 name 重复，已忽略：${route.name}`)
        return
      }
      state.routes.push(route)
    },
    useStorageAdapter: (adapter) => {
      state.storageAdapter = adapter
      console.info(`[extensions] 存储适配器已切换为 ${adapter.id}`)
    },
    useAsyncStorageAdapter: (adapter) => {
      state.asyncStorageAdapter = adapter
      console.info(`[extensions] 异步存储适配器已切换为 ${adapter.id}`)
    },
    useAiAdapter: (adapter) => {
      state.aiAdapter = adapter
      console.info(`[extensions] AI 适配器已切换为 ${adapter.id}`)
    },
    useReviewStrategy: (strategy) => {
      state.reviewStrategy = strategy
      console.info(`[extensions] 复习策略已切换为 ${strategy.id}`)
    },
  }
}

export async function installPlugin(plugin: Plugin): Promise<void> {
  if (state.plugins.some((item) => item.manifest.id === plugin.manifest.id)) {
    console.warn(`[extensions] 插件重复安装，已忽略：${plugin.manifest.id}`)
    return
  }
  // 先登记，禁用状态下也能在设置页看到
  state.plugins.push(plugin)
  if (!isPluginEnabled(plugin.manifest.id)) return

  try {
    // 必须 await：SDK 允许 setup 返回 Promise。若不等待，异步插件后续注册的
    // 路由会晚于 router.addRoute，app:ready 也会在它订阅之前发出。
    await plugin.setup(createContext(plugin.manifest.id))
  } catch (err) {
    // 单个插件失败不影响其他插件与整个应用启动
    console.error(`[extensions] 插件 ${plugin.manifest.id} 安装失败`, err)
  }
}

/** 插件页面也套一层错误边界，避免第三方组件的渲染异常让整页白屏 */
function wrapRouteComponent(component: Component, label: string): Component {
  return defineComponent({
    name: 'PluginRouteBoundary',
    setup() {
      return () => h(PluginBoundary, { label, component })
    },
  })
}

export interface BootstrapOptions {
  plugins: Plugin[]
  router?: Router
}

/**
 * 在 app.use(router) 与 app.mount 之前 await 调用：
 * 等待全部插件（含异步 setup）→ 注入动态路由 → 广播 app:ready。
 * 顺序保证：首次导航发生在所有插件注册完成之后。
 */
export async function bootstrapExtensions({ plugins, router }: BootstrapOptions): Promise<void> {
  for (const plugin of plugins) {
    await installPlugin(plugin)
  }

  if (router) {
    state.routes.forEach((route) => {
      router.addRoute('root', {
        path: route.path,
        name: route.name,
        component: wrapRouteComponent(route.component, route.title ?? route.name),
        meta: { title: route.title ?? route.name },
      })
    })
  }

  events.emit('app:ready')
}
