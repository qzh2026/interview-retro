import type { PersistedState } from '@/types'
import { nowISO } from '@/utils/date'
import { loadState, saveState } from './storage'

/**
 * 泛型仓储：把「读状态 → 改集合 → 写回」收敛到一处。
 * 目前是同步 localStorage 实现；将来换异步数据库时，把返回值改成 Promise 即可，
 * 页面层通过 store 调用，改动面可控。
 */
export type CollectionKey = 'interviews' | 'questions'
type ItemOf<K extends CollectionKey> = PersistedState[K][number]

export function createRepository<K extends CollectionKey>(key: K) {
  function all(): ItemOf<K>[] {
    return [...(loadState()[key] as ItemOf<K>[])]
  }

  function find(id: string): ItemOf<K> | null {
    return all().find((item) => item.id === id) ?? null
  }

  function insert(item: ItemOf<K>): ItemOf<K> {
    const state = loadState()
    Object.assign(state, { [key]: [item, ...(state[key] as ItemOf<K>[])] })
    saveState(state)
    return item
  }

  /**
   * 批量写入：一次读、一次写，避免「导入 N 条 → N 次全量 JSON 解析与序列化」的 O(n²) 行为。
   * 批量导入插件（如 builtin:text-import）必须走这里，不要循环调用 insert。
   */
  function insertMany(newItems: ItemOf<K>[]): ItemOf<K>[] {
    if (newItems.length === 0) return []
    const state = loadState()
    Object.assign(state, { [key]: [...newItems, ...(state[key] as ItemOf<K>[])] })
    saveState(state)
    return newItems
  }

  function update(id: string, patch: Partial<ItemOf<K>>): ItemOf<K> | null {
    const state = loadState()
    const list = state[key] as ItemOf<K>[]
    const idx = list.findIndex((item) => item.id === id)
    if (idx < 0) return null

    const next = { ...list[idx], ...patch, updatedAt: nowISO() } as ItemOf<K>
    const nextList = [...list]
    nextList[idx] = next
    Object.assign(state, { [key]: nextList })
    saveState(state)
    return next
  }

  function remove(id: string): boolean {
    const state = loadState()
    const list = state[key] as ItemOf<K>[]
    const nextList = list.filter((item) => item.id !== id)
    if (nextList.length === list.length) return false
    Object.assign(state, { [key]: nextList })
    saveState(state)
    return true
  }

  function replaceAll(items: ItemOf<K>[]): void {
    const state = loadState()
    Object.assign(state, { [key]: items })
    saveState(state)
  }

  return { all, find, insert, insertMany, update, remove, replaceAll }
}
