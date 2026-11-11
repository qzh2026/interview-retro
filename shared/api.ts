/**
 * 前后端共享的 API 契约（纯类型与常量，无任何运行时依赖）。
 *
 * 前端打包时可以直接 import 本文件；不要在这里引入 zod / drizzle 等服务端依赖。
 */

/** 规范化错误码：客户端据此映射可读文案，不依赖 HTTP 状态字符串 */
export const ERROR_CODES = {
  INVALID_CONFIG: 'INVALID_CONFIG',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  /** 登录凭据不正确（邮箱与密码错误共用此码，避免用户枚举） */
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  DATABASE_ERROR: 'DATABASE_ERROR',
  /** AI 代理：服务端未配置 AI_API_KEY / AI_MODEL，代理端点拒绝服务 */
  AI_NOT_CONFIGURED: 'AI_NOT_CONFIGURED',
  /** AI 代理：上游模型服务出错（非 2xx / 响应不可解析） */
  AI_UPSTREAM_ERROR: 'AI_UPSTREAM_ERROR',
  /** AI 代理：上游模型服务响应超时 */
  AI_TIMEOUT: 'AI_TIMEOUT',
  INTERNAL: 'INTERNAL',
} as const

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]

/**
 * 所有错误响应的统一结构。
 * 客户端永远不会拿到堆栈、SQL 或内部异常文本；requestId 用于对照服务端日志。
 */
export interface ApiErrorBody {
  error: {
    code: ErrorCode
    message: string
    requestId: string
    /** 仅包含可公开的字段级信息，如校验失败的字段名 */
    details?: unknown
  }
}

/** GET /health —— 进程存活，不查数据库 */
export interface HealthResponse {
  status: 'ok'
  version: string
  uptimeSeconds: number
  timestamp: string
}

/** GET /ready —— 数据库连通且迁移已应用 */
export interface ReadyResponse {
  status: 'ready'
  database: 'ok'
  timestamp: string
}

/* ============================================================
 * 鉴权（Stage 4）
 *
 * 约定：accessToken 只能放内存，禁止写入 localStorage / URL；
 * 刷新令牌由服务端签发，经 HttpOnly Cookie 流转，客户端代码永远看不到它。
 * ========================================================== */

export interface AuthUser {
  id: string
  email: string
  displayName: string | null
}

export interface RegisterRequest {
  email: string
  password: string
  displayName?: string
}

export interface LoginRequest {
  email: string
  password: string
}

export interface AuthResponse {
  user: AuthUser
  /** 短时效访问令牌（JWT），只放内存 */
  accessToken: string
  /** 有效期（秒），客户端据此提前刷新 */
  expiresIn: number
}

/** POST /api/auth/refresh —— 用 HttpOnly Cookie 里的刷新令牌换新访问令牌 */
export type RefreshResponse = AuthResponse

export interface LogoutResponse {
  ok: true
}

/* ============================================================
 * 增量同步（Stage 4）
 *
 * 服务端只存变更日志（append-only）+ 墓碑物化视图；
 * 冲突合并由客户端按「字段级 LWW」收敛，服务端不参与合并判定。
 * ========================================================== */

export type SyncEntityType = 'interview' | 'question' | 'settings'
export type SyncOp = 'upsert' | 'delete'

/** 一条字段级变更。changeId 是幂等键：重试必须复用同一 id */
export interface SyncChangeInput {
  changeId: string
  entityType: SyncEntityType
  entityId: string
  op: SyncOp
  /** 客户端毫秒时间戳，字段级 LWW 的比较依据 */
  updatedAt: number
  /** op=upsert 时携带：只含本条变更涉及的字段 */
  fields?: Record<string, unknown>
}

export interface SyncPushRequest {
  changes: SyncChangeInput[]
}

export interface SyncPushResponse {
  /** 本次新写入的变更数 */
  accepted: number
  /** 因 changeId 重复而跳过的变更数（幂等重放） */
  duplicates: number
  /** 服务端当前最大 seq，可作为下一次 pull 的 since */
  cursor: number
}

export interface SyncChangeRecord extends SyncChangeInput {
  /** 服务端单调递增序号，pull 的增量游标 */
  seq: number
}

export interface SyncPullResponse {
  cursor: number
  changes: SyncChangeRecord[]
}

/* ============================================================
 * AI 复盘代理（Stage 5）
 *
 * 结构与 src/sdk/types.ts 的 AiReviewRequest / AiReviewResponse
 * 保持一致（SDK 独立不依赖 shared，两边各自声明、结构兼容）。
 * 密钥只存在于服务端环境变量，前端只拿这两个 DTO 走 HTTP。
 * ========================================================== */

export interface AiReviewRequest {
  /** 题目内容 */
  content: string
  /** 我当时的回答 */
  myAnswer: string
  category: string
  tags?: string[]
}

export interface AiReviewResponse {
  /** 参考的正确思路 / 理想回答 */
  idealAnswer: string
  suggestedTags: string[]
  /** 改进建议 */
  suggestions: string[]
}
