import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../server/app'
import { loadConfig, type AppConfig } from '../../server/config/env'
import { createDatabase, type Database } from '../../server/db/client'
import { runMigrations } from '../../server/db/migrate'
import { createAuthRepository } from '../../server/modules/auth/repository'
import { createAuthService } from '../../server/modules/auth/service'
import { createTokenVerifier } from '../../server/modules/auth/tokens'
import { createHealthRepository } from '../../server/modules/health/repository'
import { createHealthService } from '../../server/modules/health/service'
import type { HealthRepository } from '../../server/modules/health/repository'
import type { HealthService } from '../../server/modules/health/service'
import { createSyncRepository } from '../../server/modules/sync/repository'
import { createSyncService } from '../../server/modules/sync/service'

/**
 * 测试应用工厂：真实内存库 + 真实迁移 + 真实 auth/sync 服务，
 * 只允许覆盖 health 层（部分用例需要注入 stub 行为）。
 */
export interface MakeTestAppOptions {
  env?: Record<string, string>
  healthRepo?: HealthRepository
  healthService?: HealthService
}

export interface TestApp {
  app: FastifyInstance
  database: Database
  config: AppConfig
}

export async function makeTestApp(options: MakeTestAppOptions = {}): Promise<TestApp> {
  const config = loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: ':memory:',
    JWT_SECRET: 'test-only-secret-not-for-production-use-000',
    ...options.env,
  })
  const database = createDatabase(':memory:')
  await runMigrations(database.db)

  const tokens = createTokenVerifier(config.jwtSecret, config.jwtAccessTtlSeconds)
  const authService = createAuthService({
    repo: createAuthRepository(database.db),
    tokens,
    refreshTokenTtlDays: config.refreshTokenTtlDays,
  })
  const syncService = createSyncService(createSyncRepository(database.db), {
    maxChangesPerPush: config.syncMaxChangesPerPush,
    pullLimit: config.syncPullLimit,
  })
  const healthService =
    options.healthService ??
    createHealthService(options.healthRepo ?? createHealthRepository(database.client), 'test-version')

  const app = await buildApp(config, { healthService, authService, syncService, tokens })
  return { app, database, config }
}

/** 注册一个测试账号并返回访问令牌与刷新 Cookie 值 */
export async function registerUser(
  app: FastifyInstance,
  email: string,
  password = 'password123',
): Promise<{ userId: string; accessToken: string; refreshCookie: string }> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email, password },
  })
  if (res.statusCode !== 200) {
    throw new Error(`register failed: ${res.statusCode} ${res.body}`)
  }
  const setCookie = res.headers['set-cookie']
  const cookieStr = Array.isArray(setCookie) ? setCookie[0] : String(setCookie ?? '')
  return {
    userId: (res.json() as { user: { id: string } }).user.id,
    accessToken: (res.json() as { accessToken: string }).accessToken,
    refreshCookie: cookieStr.split(';')[0] ?? '',
  }
}
