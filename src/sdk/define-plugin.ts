import type { Plugin } from './types'

/**
 * 定义插件的唯一入口。带类型推导：写错 manifest 字段名或漏 setup 会直接编译报错。
 *
 * 用法：
 * ```ts
 * export default definePlugin({
 *   manifest: { id: 'me:hello', name: 'Hello', version: '1.0.0', contributes: ['event'] },
 *   setup({ events, log }) {
 *     events.on('question:created', (q) => log('新题', q.content))
 *   },
 * })
 * ```
 */
export function definePlugin(plugin: Plugin): Plugin {
  if (!plugin?.manifest?.id || !plugin?.manifest?.name) {
    throw new Error('[sdk] 插件必须声明 manifest.id 与 manifest.name')
  }
  if (!/^[\w-]+:[\w-]+$/.test(plugin.manifest.id)) {
    console.warn(`[sdk] 插件 id 建议使用 namespace:name 形式，当前为 ${plugin.manifest.id}`)
  }
  if (typeof plugin.setup !== 'function') {
    throw new Error('[sdk] 插件必须实现 setup(ctx)')
  }
  return plugin
}
