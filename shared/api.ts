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
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  DATABASE_ERROR: 'DATABASE_ERROR',
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
