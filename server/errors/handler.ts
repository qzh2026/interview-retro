import type { FastifyInstance } from 'fastify'
import { ERROR_CODES, type ApiErrorBody, type ErrorCode } from '../../shared/api'
import { AppError } from './app-error'

function body(code: ErrorCode, message: string, requestId: string, details?: unknown): ApiErrorBody {
  return { error: { code, message, requestId, ...(details === undefined ? {} : { details }) } }
}

/**
 * 全局错误处理 + 兜底 404。
 * 约定：客户端只看到规范化结构；堆栈、SQL、驱动异常只进服务端日志。
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setNotFoundHandler((request, reply) => {
    request.log.info({ url: request.url }, 'route not found')
    void reply.code(404).send(body(ERROR_CODES.NOT_FOUND, '请求的资源不存在', request.id))
  })

  app.setErrorHandler((error, request, reply) => {
    const requestId = request.id

    if (error instanceof AppError) {
      // 4xx 属于客户端行为，warn 即可；5xx 才记 error
      const log = error.statusCode >= 500 ? request.log.error : request.log.warn
      log.call(request.log, { code: error.code, statusCode: error.statusCode }, error.message)
      void reply
        .code(error.statusCode)
        .send(body(error.code, error.message, requestId, error.details))
      return
    }

    // Fastify 自身的 schema / 解析错误，带 statusCode 但不含敏感信息
    const statusCode = (error as { statusCode?: number }).statusCode
    if (statusCode === 429) {
      request.log.warn({ statusCode }, 'rate limit exceeded')
      void reply
        .code(429)
        .send(body(ERROR_CODES.RATE_LIMITED, '请求过于频繁，请稍后再试', requestId))
      return
    }
    if (typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500) {
      request.log.warn({ statusCode }, 'request rejected by framework')
      void reply
        .code(statusCode)
        .send(body(ERROR_CODES.VALIDATION_ERROR, '请求格式不合法', requestId))
      return
    }

    // 未知异常：服务端记完整上下文，客户端只拿通用提示
    request.log.error(
      { err: error, code: ERROR_CODES.INTERNAL },
      'unhandled error',
    )
    void reply
      .code(500)
      .send(body(ERROR_CODES.INTERNAL, '服务器内部错误，请稍后重试', requestId))
  })
}
