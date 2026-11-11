import { randomUUID } from 'node:crypto'
import Fastify, { type FastifyInstance } from 'fastify'
import type { AppConfig } from './config/env'
import { registerErrorHandler } from './errors/handler'
import { registerCors } from './http/cors'
import { registerHooks } from './http/hooks'
import { createLoggerOptions } from './http/logger'
import { registerHealthRoutes } from './modules/health/controller'
import type { HealthService } from './modules/health/service'

/** 外部依赖显式注入：单测可以塞 stub，不必起真实数据库与端口 */
export interface AppDeps {
  healthService: HealthService
}

/**
 * 组装应用，不负责监听端口。
 * 中间件顺序：实例级日志 / requestId → 安全头 → 全局错误与 404 → CORS → 业务路由。
 */
export async function buildApp(config: AppConfig, deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: createLoggerOptions(config),
    genReqId: () => randomUUID(),
  })

  registerHooks(app, config)
  registerErrorHandler(app)
  await registerCors(app, config)
  registerHealthRoutes(app, deps.healthService)

  await app.ready()
  return app
}
