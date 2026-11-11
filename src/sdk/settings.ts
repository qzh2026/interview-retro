import { PLUGIN_SETTINGS_KEY } from '@/constants'

/**
 * 供 UI 插槽组件读取本插件持久化的配置。
 * 注意：返回的是快照、非响应式；组件应在 onMounted 时读取，或自行提供刷新入口。
 */
export function getPluginSettings<T>(pluginId: string): T | null {
  if (typeof window === 'undefined') return null
  try {
    const all = JSON.parse(window.localStorage.getItem(PLUGIN_SETTINGS_KEY) ?? '{}') as Record<
      string,
      unknown
    >
    return (all[pluginId] as T) ?? null
  } catch {
    return null
  }
}
