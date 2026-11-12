import type { Interview, PersistedState, Question } from '@/types'
import { DEFAULT_SETTINGS, SCHEMA_VERSION } from '@/constants'
import type { SyncChangeInput } from '../../../shared/api'

/**
 * 字段级 LWW（Last-Write-Wins）合并。
 *
 * 比较依据是「客户端毫秒时间戳 + changeId 决胜」：时间戳新者胜，
 * 时间戳相同按 changeId 字典序决出——保证任意设备以任意顺序应用变更都收敛到同一状态。
 *
 * 墓碑语义：delete 与 upsert 在实体级比较时间戳（delete 用删除时间），
 * 「删场次不删题」只是 question.interviewId 的 upsert，不会误删题目。
 *
 * 本文件是纯函数（不改入参），配套单测见 tests/cloud-merge.test.ts。
 */

export interface FieldStamp {
  /** 客户端毫秒时间戳 */
  t: number
  /** changeId，时间戳相同时的决胜键 */
  c: string
}

/** 单个实体的字段时间戳；'__entity' 保留给实体级事件（删除 / 复活） */
export type EntityStamps = Record<string, FieldStamp | undefined>
export type Stamps = Record<string, EntityStamps>

/** 一次「远端覆盖本地且值有实质差异」的记录；不进 PersistedState，由适配器落盘到独立 key */
export interface SyncConflict {
  /** 稳定 id：${entityType}:${entityId}:${field}:${changeId} */
  id: string
  entityType: 'interview' | 'question' | 'settings'
  entityId: string
  field: string
  /** 被覆盖前的本地值 */
  localValue: unknown
  /** 远端写入的新值 */
  remoteValue: unknown
  /** 本地原时间戳与 changeId */
  localStamp: FieldStamp
  /** 远端变更的时间戳与 changeId */
  remoteStamp: FieldStamp
  /** 远端变更 changeId */
  remoteChangeId: string
  /** 检测到冲突的时间（ISO） */
  detectedAt: string
}

const ZERO_STAMP: FieldStamp = { t: 0, c: '' }

export function stampKey(entityType: string, entityId: string): string {
  return `${entityType}:${entityId}`
}

function wins(incoming: FieldStamp, local: FieldStamp): boolean {
  return incoming.t > local.t || (incoming.t === local.t && incoming.c > local.c)
}

function parseTime(iso: unknown): number {
  if (typeof iso !== 'string') return 0
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : 0
}

/** 实质差异判断：基本相等（含数组/对象 JSON 一致）视为无差异，避免噪音 */
function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  return JSON.stringify(a) === JSON.stringify(b)
}

function emptyState(): PersistedState {
  return {
    schemaVersion: SCHEMA_VERSION,
    interviews: [],
    questions: [],
    settings: { ...DEFAULT_SETTINGS, reviewIntervals: [...DEFAULT_SETTINGS.reviewIntervals] },
  }
}

/** 把持久化原始对象整理成可合并的形状（宽松，不做完整迁移——完整迁移由 storage.migrate 负责） */
export function toMergeableState(raw: unknown): PersistedState {
  if (typeof raw !== 'object' || raw === null) return emptyState()
  const data = raw as Partial<PersistedState>
  return {
    schemaVersion: typeof data.schemaVersion === 'number' ? data.schemaVersion : 1,
    interviews: Array.isArray(data.interviews) ? [...data.interviews] : [],
    questions: Array.isArray(data.questions) ? [...data.questions] : [],
    settings: (data.settings ?? emptyState().settings) as PersistedState['settings'],
  }
}

type EntityList = Array<Interview | Question>

/**
 * 应用一批变更（按接收顺序，LWW 保证顺序无关收敛）。
 * 入参 state / stamps 不会被修改。
 */
export function mergeChanges(
  state: PersistedState,
  changes: ReadonlyArray<SyncChangeInput & { seq?: number }>,
  stamps: Stamps,
): { state: PersistedState; stamps: Stamps; conflicts: SyncConflict[] } {
  const conflicts: SyncConflict[] = []
  const next: PersistedState = {
    schemaVersion: state.schemaVersion,
    interviews: [...state.interviews],
    questions: [...state.questions],
    settings: { ...state.settings },
  }
  const out: Stamps = {}
  // 浅拷贝每个实体的时间戳对象：入参 stamps 绝不能被修改（纯函数约定）
  for (const [key, value] of Object.entries(stamps)) {
    out[key] = { ...value }
  }

  const entityStamps = (key: string): EntityStamps => {
    if (!out[key]) out[key] = {}
    return out[key]
  }

  const listFor = (entityType: string): EntityList | null =>
    entityType === 'interview' ? next.interviews : entityType === 'question' ? next.questions : null

  for (const change of changes) {
    const key = stampKey(change.entityType, change.entityId)
    const stamp = entityStamps(key)
    const incoming: FieldStamp = { t: change.updatedAt, c: change.changeId }

    if (change.op === 'delete') {
      const list = listFor(change.entityType)
      if (!list) continue
      const idx = list.findIndex((item) => item.id === change.entityId)
      const entityTs =
        idx >= 0 ? parseTime((list[idx] as unknown as Record<string, unknown>).updatedAt) : 0
      const local = stamp.__entity ?? { t: entityTs, c: '' }
      if (!wins(incoming, local)) continue
      stamp.__entity = incoming
      if (idx >= 0) {
        const filtered = [...list.slice(0, idx), ...list.slice(idx + 1)] as EntityList
        if (change.entityType === 'interview') next.interviews = filtered as Interview[]
        else next.questions = filtered as Question[]
      }
      continue
    }

    // —— upsert ——
    if (change.entityType === 'settings') {
      const settings = next.settings as unknown as Record<string, unknown>
      for (const [field, value] of Object.entries(change.fields ?? {})) {
        const local = stamp[field] ?? ZERO_STAMP
        if (!wins(incoming, local)) continue
        const oldValue = settings[field]
        if (!valuesEqual(oldValue, value)) {
          conflicts.push({
            id: `${key}:${field}:${change.changeId}`,
            entityType: 'settings',
            entityId: change.entityId,
            field,
            localValue: oldValue,
            remoteValue: value,
            localStamp: local,
            remoteStamp: incoming,
            remoteChangeId: change.changeId,
            detectedAt: new Date().toISOString(),
          })
        }
        settings[field] = value
        stamp[field] = incoming
      }
      continue
    }

    const list = listFor(change.entityType)
    if (!list) continue
    const idx = list.findIndex((item) => item.id === change.entityId)

    if (idx < 0) {
      // 复活：必须赢过实体级墓碑（无墓碑视为时间戳 0，直接创建）
      const local = stamp.__entity ?? ZERO_STAMP
      if (!wins(incoming, local)) continue
      const created = { id: change.entityId, ...(change.fields ?? {}) } as unknown as
        Interview | Question
      const createdList = [created, ...list] as EntityList
      if (change.entityType === 'interview') next.interviews = createdList as Interview[]
      else next.questions = createdList as Question[]
      for (const field of Object.keys(change.fields ?? {})) {
        stamp[field] = incoming
      }
      continue
    }

    const entity = list[idx] as unknown as Record<string, unknown>
    // 没有独立字段时间戳时，用实体 updatedAt 兜底（首个登录/换设备场景）
    const fallback: FieldStamp = { t: parseTime(entity.updatedAt), c: '' }
    const patch: Record<string, unknown> = {}
    let touched = false
    for (const [field, value] of Object.entries(change.fields ?? {})) {
      const local = stamp[field] ?? fallback
      if (!wins(incoming, local)) continue
      const oldValue = entity[field]
      if (!valuesEqual(oldValue, value)) {
        conflicts.push({
          id: `${key}:${field}:${change.changeId}`,
          entityType: change.entityType as 'interview' | 'question',
          entityId: change.entityId,
          field,
          localValue: oldValue,
          remoteValue: value,
          localStamp: local,
          remoteStamp: incoming,
          remoteChangeId: change.changeId,
          detectedAt: new Date().toISOString(),
        })
      }
      patch[field] = value
      stamp[field] = incoming
      touched = true
    }
    if (!touched) continue

    const updatedList = [...list]
    updatedList[idx] = { ...entity, ...patch } as unknown as Interview | Question
    if (change.entityType === 'interview') next.interviews = updatedList as Interview[]
    else next.questions = updatedList as Question[]
  }

  return { state: next, stamps: out, conflicts }
}

/** 本地写入产生的变更也要记时间戳，防止回声与旧远端变更覆盖新本地值 */
export function applyOwnStamps(stamps: Stamps, changes: ReadonlyArray<SyncChangeInput>): Stamps {
  const out: Stamps = { ...stamps }
  for (const change of changes) {
    const key = stampKey(change.entityType, change.entityId)
    out[key] = { ...(out[key] ?? {}) }
    const stamp = out[key]
    const own: FieldStamp = { t: change.updatedAt, c: change.changeId }
    if (change.op === 'delete') {
      stamp.__entity = own
      continue
    }
    for (const field of Object.keys(change.fields ?? {})) {
      stamp[field] = own
    }
  }
  return out
}
