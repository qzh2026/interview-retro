import { randomUUID } from 'node:crypto'
import Fastify, { type FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import rateLimit from '@fastify/rate-limit'
import type { AppConfig } from './config/env'
import { registerErrorHandler } from './errors/handler'
import { registerCors } from './http/cors'
import { registerHooks } from './http/hooks'
import { createLoggerOptions } from './http/logger'
import { registerAuthRoutes } from './modules/auth/controller'
import type { TokenVerifier } from './modules/auth/tokens'
import type { AuthService } from './modules/auth/service'
import { registerHealthRoutes } from './modules/health/controller'
import type { HealthService } from './modules/health/service'
import { registerSyncRoutes } from './modules/sync/controller'
import type { SyncService } from './modules/sync/service'

/** 外部依赖显式注入：单测可以塞 stub，不必起真实数据库与端口 */
export interface AppDeps {
  healthService: HealthService
  authService: AuthService
  syncService: SyncService
  tokens: TokenVerifier
}

/**
 * 组装应用，不负责监听端口。
 * 中间件顺序：实例级日志 / requestId → 安全头 → 全局错误与 404 → CORS →
 * cookie / 限流 → 业务路由。
 */
export async function buildApp(config: AppConfig, deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: createLoggerOptions(config),
    genReqId: () => randomUUID(),
  })

  registerHooks(app, config)
  registerErrorHandler(app)
  await registerCors(app, config)
  // 刷新令牌走 HttpOnly Cookie；限流只对显式声明的路由生效（global: false）
  await app.register(cookie)
  await app.register(rateLimit, { global: false })

  registerHealthRoutes(app, deps.healthService)
  registerAuthRoutes(app, deps.authService, deps.tokens, config)
  registerSyncRoutes(app, deps.syncService, deps.tokens)

  await app.ready()
  return app
}
