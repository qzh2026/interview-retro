import type { AppSettings, Interview, PersistedState, Question } from '@/types'
import { CORRUPT_SNAPSHOT_KEY, DEFAULT_SETTINGS, SCHEMA_VERSION } from '@/constants'
import { nowISO, todayISO } from '@/utils/date'
import { newId } from '@/utils/id'
import { getStorageGateway } from './storage-gateway'
import { withStorageLock } from './storage-queue'
import { clearStorageIssue, reportStorageIssue } from './storage-health'

/**
 * 本地持久化驱动（异步链路）。
 *
 * 原始读写统一经 storage-gateway：优先用插件注册的 AsyncStorageAdapter，
 * 没有则把同步 StorageAdapter 自动包成 Promise，v1 插件零改动仍可使用。
 * 本文件只负责 JSON 序列化、schema 迁移与字段兜底。
 *
 * 常见坑：
 * 1. 本地存储约 5MB 上限，隐私模式可能抛异常 → 适配器降级到内存，并通过 storage-health 上报给 UI。
 * 2. 数据格式会随版本演进 → 读取时统一走 migrate()，不要直接信任存量数据。
 * 3. JSON 解析失败时不能直接空手上阵：原始串会另存到 CORRUPT_SNAPSHOT_KEY，
 *    否则用户看到空界面后随手一改，saveState 就会把可恢复的原始数据彻底覆盖。
 * 4. 所有 IO 都是 async：复合「读→改→写」必须经 withStorageLock 排队，否则并发写会丢数据。
 * 5. 一定要配 JSON 导出备份，清浏览器数据 = 数据全没了（见 services/backup.ts）。
 */

function emptyState(): PersistedState {
  return {
    schemaVersion: SCHEMA_VERSION,
    interviews: [],
    questions: [],
    settings: { ...DEFAULT_SETTINGS, reviewIntervals: [...DEFAULT_SETTINGS.reviewIntervals] },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 把无法解析的原始串另存一份，绕开可能被替换的适配器，确保不会被后续写操作覆盖 */
function preserveCorruptRaw(raw: string): void {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(CORRUPT_SNAPSHOT_KEY, raw)
    }
  } catch (err) {
    console.error('[storage] 损坏数据副本保存失败，请从控制台日志复制原始串', raw, err)
  }
}

export function getCorruptSnapshot(): string | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage.getItem(CORRUPT_SNAPSHOT_KEY)
  } catch {
    return null
  }
}

export function clearCorruptSnapshot(): void {
  try {
    if (typeof window !== 'undefined') window.localStorage.removeItem(CORRUPT_SNAPSHOT_KEY)
  } catch {
    // 存储不可用时，副本本来就不存在
  }
  clearStorageIssue()
}

async function rawGet(): Promise<string | null> {
  try {
    return await getStorageGateway().read()
  } catch (err) {
    console.error('[storage] 适配器读取失败', err)
    reportStorageIssue({ kind: 'read-failed', message: '存储适配器读取失败，请检查插件配置。' })
    return null
  }
}

async function rawSet(value: string): Promise<void> {
  try {
    await getStorageGateway().write(value)
  } catch (err) {
    console.error('[storage] 适配器写入失败，本次改动可能未持久化', err)
    reportStorageIssue({
      kind: 'write-failed',
      message: '存储适配器写入失败，本次改动可能没有保存，请立即导出 JSON 备份。',
    })
  }
}

function normalizeSettings(raw: unknown): AppSettings {
  const data = isRecord(raw) ? raw : {}
  const intervals = Array.isArray(data.reviewIntervals)
    ? data.reviewIntervals.filter(
        (n): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0,
      )
    : []
  const limit = data.dailyReviewLimit
  return {
    reviewIntervals: intervals.length > 0 ? intervals : [...DEFAULT_SETTINGS.reviewIntervals],
    dailyReviewLimit:
      typeof limit === 'number' && Number.isFinite(limit) && limit >= 1
        ? Math.floor(limit)
        : DEFAULT_SETTINGS.dailyReviewLimit,
  }
}

/**
 * 补齐历史版本缺失的字段，并容忍脏数据（null 元素、缺字段、类型不对）。
 * 备份导入和本地读取都走这里，避免一条坏记录让整个应用白屏。
 * 每加一个 SCHEMA_VERSION，就在这里加一条分支。
 */
function migrate(raw: unknown): PersistedState {
  const data = isRecord(raw) ? raw : {}
  const version = typeof data.schemaVersion === 'number' ? data.schemaVersion : 0
  if (version < SCHEMA_VERSION) {
    console.info(`[storage] 数据迁移 v${version} → v${SCHEMA_VERSION}`)
  }

  const rawInterviews = Array.isArray(data.interviews) ? data.interviews : []
  const interviews: Interview[] = rawInterviews.filter(isRecord).map((item) => {
    const it = item as unknown as Partial<Interview>
    const ts = nowISO()
    return {
      ...it,
      id: it.id || newId(),
      company: it.company ?? '',
      position: it.position ?? '',
      round: it.round ?? 'other',
      date: it.date ?? todayISO(),
      result: it.result ?? 'pending',
      metadata: isRecord(it.metadata) ? it.metadata : {},
      createdAt: it.createdAt ?? ts,
      updatedAt: it.updatedAt ?? ts,
    } as Interview
  })

  const rawQuestions = Array.isArray(data.questions) ? data.questions : []
  const questions: Question[] = rawQuestions.filter(isRecord).map((item) => {
    const q = item as unknown as Partial<Question>
    const ts = nowISO()
    return {
      ...q,
      id: q.id || newId(),
      interviewId: q.interviewId ?? null,
      content: q.content ?? '',
      category: q.category ?? 'other',
      tags: Array.isArray(q.tags) ? q.tags.filter((t): t is string => typeof t === 'string') : [],
      difficulty: q.difficulty ?? 3,
      myAnswer: q.myAnswer ?? '',
      idealAnswer: q.idealAnswer ?? '',
      lesson: q.lesson ?? '',
      selfRating: q.selfRating ?? 3,
      mastery: q.mastery ?? 'unknown',
      reviewCount: q.reviewCount ?? 0,
      lastReviewedAt: q.lastReviewedAt ?? null,
      nextReviewAt: q.nextReviewAt ?? todayISO(),
      metadata: isRecord(q.metadata) ? q.metadata : {},
      createdAt: q.createdAt ?? ts,
      updatedAt: q.updatedAt ?? ts,
    } as Question
  })

  return {
    schemaVersion: SCHEMA_VERSION,
    interviews,
    questions,
    settings: normalizeSettings(data.settings),
  }
}

export async function loadState(): Promise<PersistedState> {
  const raw = await rawGet()
  if (!raw) return emptyState()
  try {
    return migrate(JSON.parse(raw) as unknown)
  } catch (err) {
    console.error('[storage] 状态解析失败，已保留原始串副本', raw, err)
    preserveCorruptRaw(raw)
    reportStorageIssue({
      kind: 'corrupt',
      message:
        '本地数据无法解析，已保留一份原始副本。请先下载副本再继续录入，否则后续操作会覆盖它。',
      raw,
    })
    return emptyState()
  }
}

export async function saveState(state: PersistedState): Promise<void> {
  await rawSet(JSON.stringify({ ...state, schemaVersion: SCHEMA_VERSION }))
}

/** 备份导入时用：整包覆盖；排队执行，避免与并发写入交错 */
export async function replaceState(state: PersistedState): Promise<void> {
  await withStorageLock(async () => {
    await saveState(migrate(state))
  })
}

export async function resetState(): Promise<void> {
  await withStorageLock(async () => {
    await saveState(emptyState())
  })
}
