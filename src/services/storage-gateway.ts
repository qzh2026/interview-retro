import type { AsyncStorageAdapter, StorageAdapter } from '@/sdk/types'
import { getAsyncStorageAdapter, getStorageAdapter } from '@/core/extensions/registry'

/**
 * 统一异步存储网关。
 *
 * 目标：核心数据层只认一条 async 链路，同时不破坏 v1 的同步适配器契约。
 * - 注册了 AsyncStorageAdapter（IndexedDB / 远端同步）→ 直接用它；
 * - 没注册 → 把当前同步 StorageAdapter 包成 Promise 版，旧插件零改动仍可用。
 *
 * 优先级是「异步适配器存在即接管」：替换型扩展点的语义保持一致，后注册覆盖。
 * 网关只做原始字符串读写，JSON 解析、schema 迁移、错误上报都在 storage.ts。
 */
export function wrapSyncAdapter(adapter: StorageAdapter): AsyncStorageAdapter {
  return {
    id: adapter.id,
    label: adapter.label,
    // 用 async 包装：同步适配器里直接 throw 也会变成 rejected promise，
    // 由 storage.ts 的 rawGet / rawSet 统一捕获并上报，异常不会冒泡到页面。
    async read() {
      return adapter.read()
    },
    async write(raw: string) {
      adapter.write(raw)
    },
    async clear() {
      adapter.clear()
    },
  }
}

/** 每次调用都重新解析注册表：插件在 bootstrap 期间仍可能替换适配器 */
export function getStorageGateway(): AsyncStorageAdapter {
  const asyncAdapter = getAsyncStorageAdapter()
  return asyncAdapter ?? wrapSyncAdapter(getStorageAdapter())
}
