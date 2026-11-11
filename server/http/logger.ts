import type { FastifyRequest, FastifyServerOptions } from 'fastify'
import type { AppConfig } from '../config/env'

/**
 * 结构化 JSON 日志（pino 由 Fastify 内置提供）。
 *
 * 脱敏两层：
 * 1. 自定义 req serializer 只保留四个字段，绝不整包输出 headers；
 * 2. redact 兜底，即便后续有人往日志里塞了凭证字段也会被移除。
 * requestId 由 genReqId 自动生成，Fastify 会把它带进每一条请求日志。
 */
export function createLoggerOptions(config: AppConfig): FastifyServerOptions['logger'] {
  return {
    level: config.logLevel,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["set-cookie"]',
        '*.password',
        '*.passwordHash',
        '*.token',
        '*.tokenHash',
        '*.accessToken',
        '*.refreshToken',
        '*.apiKey',
      ],
      remove: true,
    },
    serializers: {
      req(request: FastifyRequest) {
        return {
          method: request.method,
          url: request.url,
          requestId: request.id,
        }
      },
    },
  }
}
