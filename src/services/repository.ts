import type { PersistedState } from '@/types'
import { nowISO } from '@/utils/date'
import { loadState, saveState } from './storage'
import { withStorageLock } from './storage-queue'

/**
 * 泛型仓储：把「读状态 → 改集合 → 写回」收敛到一处。
 *
 * 统一 async 链路，底层可能是被包装的同步适配器，也可能是 IndexedDB / 远端同步适配器。
 * 每个方法都用 withStorageLock 包住完整的读改写，避免并发操作读到旧快照后互相覆盖。
 * 注意：方法之间**不能互相调用**（会嵌套加锁导致死锁），所以 all / find 各自直接读状态。
 */
export type CollectionKey = 'interviews' | 'questions'
type ItemOf<K extends CollectionKey> = PersistedState[K][number]

export function createRepository<K extends CollectionKey>(key: K) {
  async function all(): Promise<ItemOf<K>[]> {
    return withStorageLock(async () => [...((await loadState())[key] as ItemOf<K>[])])
  }

  async function find(id: string): Promise<ItemOf<K> | null> {
    return withStorageLock(async () => {
      const list = (await loadState())[key] as ItemOf<K>[]
      return list.find((item) => item.id === id) ?? null
    })
  }

  async function insert(item: ItemOf<K>): Promise<ItemOf<K>> {
    return withStorageLock(async () => {
      const state = await loadState()
      Object.assign(state, { [key]: [item, ...(state[key] as ItemOf<K>[])] })
      await saveState(state)
      return item
    })
  }

  /**
   * 批量写入：一次读、一次写，避免「导入 N 条 → N 次全量 JSON 解析与序列化」的 O(n²) 行为。
   * 批量导入插件（如 builtin:text-import）必须走这里，不要循环调用 insert。
   */
  async function insertMany(newItems: ItemOf<K>[]): Promise<ItemOf<K>[]> {
    if (newItems.length === 0) return []
    return withStorageLock(async () => {
      const state = await loadState()
      Object.assign(state, { [key]: [...newItems, ...(state[key] as ItemOf<K>[])] })
      await saveState(state)
      return newItems
    })
  }

  async function update(id: string, patch: Partial<ItemOf<K>>): Promise<ItemOf<K> | null> {
    return withStorageLock(async () => {
      const state = await loadState()
      const list = state[key] as ItemOf<K>[]
      const idx = list.findIndex((item) => item.id === id)
      if (idx < 0) return null

      const next = { ...list[idx], ...patch, updatedAt: nowISO() } as ItemOf<K>
      const nextList = [...list]
      nextList[idx] = next
      Object.assign(state, { [key]: nextList })
      await saveState(state)
      return next
    })
  }

  async function remove(id: string): Promise<boolean> {
    return withStorageLock(async () => {
      const state = await loadState()
      const list = state[key] as ItemOf<K>[]
      const nextList = list.filter((item) => item.id !== id)
      if (nextList.length === list.length) return false
      Object.assign(state, { [key]: nextList })
      await saveState(state)
      return true
    })
  }

  async function replaceAll(items: ItemOf<K>[]): Promise<void> {
    return withStorageLock(async () => {
      const state = await loadState()
      Object.assign(state, { [key]: items })
      await saveState(state)
    })
  }

  return { all, find, insert, insertMany, update, remove, replaceAll }
}
