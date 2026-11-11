import type {
  AppSettings,
  Difficulty,
  InterviewResult,
  InterviewRound,
  MasteryLevel,
  QuestionCategory,
  SelfRating,
} from '@/types'

/** 改 schema 时 +1，并在 services/storage.ts 的 migrate() 里补一条迁移逻辑 */
export const SCHEMA_VERSION = 1
export const STORAGE_KEY = 'interview-retro:state'
/** 数据解析失败时，把原始串另存到这个 key，避免被后续写操作覆盖后无法找回 */
export const CORRUPT_SNAPSHOT_KEY = 'interview-retro:corrupt-snapshot'

export const DEFAULT_SETTINGS: AppSettings = {
  reviewIntervals: [1, 3, 7, 15, 30, 60],
  dailyReviewLimit: 20,
}

/** 扩展系统独立使用的两个 key，不污染主数据快照 */
export const PLUGIN_STATE_KEY = 'interview-retro:extensions'
export const PLUGIN_SETTINGS_KEY = 'interview-retro:plugin-settings'

export interface Option<T extends string | number> {
  value: T
  label: string
}

export const ROUND_OPTIONS: Option<InterviewRound>[] = [
  { value: 'written', label: '笔试 / 测评' },
  { value: 'tech1', label: '技术一面' },
  { value: 'tech2', label: '技术二面' },
  { value: 'tech3', label: '技术三面' },
  { value: 'cross', label: '交叉面' },
  { value: 'manager', label: '主管面' },
  { value: 'hr', label: 'HR 面' },
  { value: 'other', label: '其他' },
]

export const RESULT_OPTIONS: Option<InterviewResult>[] = [
  { value: 'pending', label: '待出结果' },
  { value: 'passed', label: '通过' },
  { value: 'failed', label: '未通过' },
  { value: 'offer', label: '已拿 Offer' },
  { value: 'withdrawn', label: '已放弃' },
]

export const CATEGORY_OPTIONS: Option<QuestionCategory>[] = [
  { value: 'tech', label: '技术基础' },
  { value: 'project', label: '项目经历' },
  { value: 'algorithm', label: '算法 / 手撕' },
  { value: 'design', label: '系统设计' },
  { value: 'behavior', label: '行为 / 软技能' },
  { value: 'hr', label: 'HR 常规' },
  { value: 'reverse', label: '反问环节' },
  { value: 'other', label: '其他' },
]

export const MASTERY_OPTIONS: Option<MasteryLevel>[] = [
  { value: 'unknown', label: '未掌握' },
  { value: 'learning', label: '巩固中' },
  { value: 'mastered', label: '已掌握' },
]

export const DIFFICULTY_OPTIONS: Option<Difficulty>[] = [
  { value: 1, label: '很简单' },
  { value: 2, label: '偏易' },
  { value: 3, label: '中等' },
  { value: 4, label: '偏难' },
  { value: 5, label: '没答上来' },
]

export const RATING_OPTIONS: Option<SelfRating>[] = [
  { value: 1, label: '1 分 · 答砸了' },
  { value: 2, label: '2 分' },
  { value: 3, label: '3 分 · 勉强' },
  { value: 4, label: '4 分' },
  { value: 5, label: '5 分 · 答得漂亮' },
]

/** 统一的 label 查询，页面里不用到处写 switch */
export function labelOf<T extends string | number>(options: Option<T>[], value: T): string {
  return options.find((o) => o.value === value)?.label ?? String(value)
}
