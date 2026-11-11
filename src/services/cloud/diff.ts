import type { PersistedState } from '@/types'
import type { SyncChangeInput, SyncEntityType } from '../../../shared/api'

/**
 * 状态差分：比较两份 PersistedState，产出字段级变更记录。
 *
 * - 新增实体 → 全字段 upsert；
 * - 修改实体 → 只带变化字段（字段级 LWW 的最小粒度）；
 * - 移除实体 → delete（「删场次不删题」在这里天然是 question.interviewId 的 upsert）；
 * - settings 是单例（entityId 固定 'singleton'）。
 *
 * 本文件是纯函数，除 changeId 生成外无副作用，配套单测见 tests/cloud-diff.test.ts。
 */

const COLLECTIONS: Array<[SyncEntityType, 'interviews' | 'questions']> = [
  ['interview', 'interviews'],
  ['question', 'questions'],
]

/** changeId 是服务端幂等键，必须全局唯一 */
export function newChangeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `chg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

function parseTime(iso: unknown): number {
  if (typeof iso !== 'string') return Date.now()
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : Date.now()
}

type EntityMap = Map<string, Record<string, unknown>>

function toMap(list: ReadonlyArray<unknown>): EntityMap {
  const map: EntityMap = new Map()
  for (const item of list) {
    if (typeof item === 'object' && item !== null) {
      const rec = item as Record<string, unknown>
      if (typeof rec.id === 'string') map.set(rec.id, rec)
    }
  }
  return map
}

/** 只返回值有差异的字段（id 不参与）；无差异返回 null */
function changedFields(
  prev: Record<string, unknown>,
  next: Record<string, unknown>,
): Record<string, unknown> | null {
  const fields: Record<string, unknown> = {}
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)])
  for (const key of keys) {
    if (key === 'id') continue
    if (JSON.stringify(prev[key]) !== JSON.stringify(next[key])) {
      fields[key] = next[key]
    }
  }
  return Object.keys(fields).length > 0 ? fields : null
}

function allFieldsExceptId(item: Record<string, unknown>): Record<string, unknown> {
  const fields: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(item)) {
    if (key !== 'id') fields[key] = value
  }
  return fields
}

export function diffStates(prev: PersistedState | null, next: PersistedState): SyncChangeInput[] {
  const changes: SyncChangeInput[] = []

  for (const [entityType, key] of COLLECTIONS) {
    const prevMap = toMap(prev?.[key] ?? [])
    const nextMap = toMap(next[key])

    for (const [id, item] of nextMap) {
      const before = prevMap.get(id)
      const fields = before ? changedFields(before, item) : allFieldsExceptId(item)
      if (!fields) continue
      changes.push({
        changeId: newChangeId(),
        entityType,
        entityId: id,
        op: 'upsert',
        updatedAt: parseTime(item.updatedAt),
        fields,
      })
    }

    for (const [id] of prevMap) {
      if (nextMap.has(id)) continue
      changes.push({
        changeId: newChangeId(),
        entityType,
        entityId: id,
        op: 'delete',
        // 删除时间取当下：删除是实体级操作，晚于任何字段更新才生效
        updatedAt: Date.now(),
      })
    }
  }

  const prevSettings = (prev?.settings ?? {}) as Record<string, unknown>
  const nextSettings = next.settings as unknown as Record<string, unknown>
  const settingsFields = changedFields(prevSettings, nextSettings)
  if (settingsFields) {
    changes.push({
      changeId: newChangeId(),
      entityType: 'settings',
      entityId: 'singleton',
      op: 'upsert',
      updatedAt: Date.now(),
      fields: settingsFields,
    })
  }

  return changes
}
