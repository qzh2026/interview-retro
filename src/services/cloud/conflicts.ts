import { computed, ref } from 'vue'
import type { SyncConflict } from './merge'

/**
 * 同步冲突的展示态（响应式单例）。
 *
 * 数据本身由云同步适配器持久化在独立 localStorage key（不进 PersistedState），
 * 这里只镜像一份给 UI 用：设置页展示前后对比、顶栏角标显示未读数。
 * 引擎在 pull 合并后调用 setConflicts 刷新；登出时清空。
 */

const conflicts = ref<SyncConflict[]>([])
const readIds = ref<Set<string>>(new Set())

export function getConflicts(): SyncConflict[] {
  return conflicts.value
}

export function setConflicts(list: SyncConflict[]): void {
  conflicts.value = list
}

/** 打开设置页即视为已读，清掉未读角标 */
export function markConflictsRead(): void {
  readIds.value = new Set(conflicts.value.map((c) => c.id))
}

/** 登出时整份清空（冲突记录属于具体账号） */
export function clearConflictsView(): void {
  conflicts.value = []
  readIds.value = new Set()
}

export const unreadConflictCount = computed(
  () => conflicts.value.filter((c) => !readIds.value.has(c.id)).length,
)
