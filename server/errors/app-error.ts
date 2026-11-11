import type { ErrorCode } from '../../shared/api'

/** 启动期配置错误：发生在 HTTP 应用创建之前，没有 requestId 可关联 */
export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigurationError'
  }
}

/**
 * 类型化业务错误。服务层只抛这个（或其子类），
 * 全局处理器负责把它映射成统一的 ApiErrorBody，控制器不写错误处理逻辑。
 */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly statusCode: number,
    message: string,
    /** 只允许放可公开的字段级信息，绝不塞原始异常 */
    readonly details?: unknown,
    options?: { cause?: unknown },
  ) {
    super(message, options)
    this.name = 'AppError'
  }

  static badRequest(message = '请求参数不合法', details?: unknown): AppError {
    return new AppError('VALIDATION_ERROR', 400, message, details)
  }

  static unauthorized(message = '未登录或登录已失效'): AppError {
    return new AppError('UNAUTHORIZED', 401, message)
  }

  static forbidden(message = '没有权限执行此操作'): AppError {
    return new AppError('FORBIDDEN', 403, message)
  }

  static notFound(message = '请求的资源不存在'): AppError {
    return new AppError('NOT_FOUND', 404, message)
  }

  static conflict(message = '数据冲突，请刷新后重试'): AppError {
    return new AppError('CONFLICT', 409, message)
  }

  static unavailable(message = '服务尚未就绪'): AppError {
    return new AppError('SERVICE_UNAVAILABLE', 503, message)
  }

  static internal(message = '服务器内部错误'): AppError {
    return new AppError('INTERNAL', 500, message)
  }
}
