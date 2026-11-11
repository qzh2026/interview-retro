import type { FastifyInstance } from 'fastify'
import type { AppConfig } from '../config/env'

/** 安全头 + 响应侧 requestId，便于客户端报错时对照服务端日志 */
export function registerHooks(app: FastifyInstance, config: AppConfig): void {
  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('x-content-type-options', 'nosniff')
    reply.header('x-frame-options', 'DENY')
    reply.header('referrer-policy', 'no-referrer')
    reply.header('x-request-id', request.id)
    // HSTS 只在生产开启：本地 http 开发不该下发这个头
    if (config.isProduction) {
      reply.header('strict-transport-security', 'max-age=31536000; includeSubDomains')
    }
    return payload
  })
}
