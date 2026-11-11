/**
 * 领域模型（前端与后端共享的单一来源）
 *
 * 设计原则：
 * 1. 以「面试场次 Interview」和「被问的题 Question」为两个核心实体，题目是复盘的最小粒度。
 * 2. myAnswer 与 idealAnswer 刻意分开：当时的回答要原样记，不要事后美化，否则复盘失去意义。
 * 3. 所有时间统一存字符串（ISO date / ISO datetime），避免 Date 对象序列化后时区错乱。
 * 4. 本文件只放纯类型，不 import 任何运行时代码（Vue / 前端 SDK / 数据库驱动），
 *    前端经 `src/types/index.ts` re-export，后端可直接 import，避免两边各写一份 DTO。
 * 5. metadata 是插件专用的扩展位：核心不解释、只透传，插件存自定义字段无需改 schema。
 */

export type ID = string
export type ISODate = string // YYYY-MM-DD
export type ISODateTime = string // ISO 8601

/** 面试轮次 */
export type InterviewRound =
  | 'written'
  | 'tech1'
  | 'tech2'
  | 'tech3'
  | 'cross'
  | 'manager'
  | 'hr'
  | 'other'

/** 本场结果 */
export type InterviewResult = 'pending' | 'passed' | 'failed' | 'offer' | 'withdrawn'

/** 题目分类 */
export type QuestionCategory =
  | 'tech'
  | 'project'
  | 'algorithm'
  | 'design'
  | 'behavior'
  | 'hr'
  | 'reverse'
  | 'other'

/** 掌握程度 */
export type MasteryLevel = 'unknown' | 'learning' | 'mastered'

export type Difficulty = 1 | 2 | 3 | 4 | 5
export type SelfRating = 1 | 2 | 3 | 4 | 5

/** 插件自定义字段，key 建议带命名空间，例如 acme:priority */
export type EntityMetadata = Record<string, unknown>

export interface Interview {
  id: ID
  company: string
  position: string
  round: InterviewRound
  date: ISODate
  result: InterviewResult
  interviewer?: string
  /** 渠道：内推 / BOSS / 官网 / 校招 ... */
  source?: string
  /** 本场整体感受、流程、面试官关注点 */
  overallNotes?: string
  /** 插件扩展字段，核心不解释 */
  metadata?: EntityMetadata
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export interface Question {
  id: ID
  /** 允许脱离场次独立录入（例如刷面经时看到的题）；删除场次时不级联删题，只置空 */
  interviewId: ID | null
  content: string
  category: QuestionCategory
  tags: string[]
  difficulty: Difficulty
  /** 当时我是怎么答的（原样记录） */
  myAnswer: string
  /** 复盘后的正确 / 更好的回答思路 */
  idealAnswer: string
  /** 踩坑点、下次遇到该怎么说 */
  lesson: string
  selfRating: SelfRating
  mastery: MasteryLevel
  /** 已完成的有效复习次数，用于计算下一轮间隔 */
  reviewCount: number
  lastReviewedAt: ISODateTime | null
  nextReviewAt: ISODate | null
  /** 插件扩展字段，核心不解释 */
  metadata?: EntityMetadata
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export interface AppSettings {
  /** 间隔重复的天数阶梯，复习成功则进入下一阶，失败则回到第一阶 */
  reviewIntervals: number[]
  /** 每日复习上限，避免一次堆太多 */
  dailyReviewLimit: number
}

/** 落库的完整状态快照 */
export interface PersistedState {
  schemaVersion: number
  interviews: Interview[]
  questions: Question[]
  settings: AppSettings
}

/** 导入导出用的文件格式 */
export interface BackupPayload {
  app: 'interview-retro'
  schemaVersion: number
  exportedAt: ISODateTime
  interviews: Interview[]
  questions: Question[]
  settings: AppSettings
  /** 随备份一起带走的插件配置表（可选，兼容旧版备份） */
  pluginSettings?: Record<string, unknown>
}

/** 新建时的入参：由存储层补齐 id 与时间戳 */
export type InterviewInput = Omit<Interview, 'id' | 'createdAt' | 'updatedAt'>
export type QuestionInput = Omit<
  Question,
  | 'id'
  | 'createdAt'
  | 'updatedAt'
  | 'reviewCount'
  | 'lastReviewedAt'
  | 'nextReviewAt'
>
