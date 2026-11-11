import { buildApp } from './app'
import { loadConfig, loadEnvFileIfPresent } from './config/env'
import { createDatabase } from './db/client'
import { runMigrations } from './db/migrate'
import { createShutdown } from './lifecycle'
import { createAiService } from './modules/ai/service'
import { createAuthRepository } from './modules/auth/repository'
import { createAuthService } from './modules/auth/service'
import { createTokenVerifier } from './modules/auth/tokens'
import { createHealthRepository } from './modules/health/repository'
import { createHealthService } from './modules/health/service'
import { createSyncRepository } from './modules/sync/repository'
import { createSyncService } from './modules/sync/service'

const SHUTDOWN_TIMEOUT_MS = 10_000

async function main(): Promise<void> {
  loadEnvFileIfPresent()
  const config = loadConfig()
  const database = createDatabase(config.databaseUrl)

  try {
    // 迁移必须先于监听：就绪探针要求 schema 已应用
    await runMigrations(database.db)

    const healthService = createHealthService(
      createHealthRepository(database.client),
      config.appVersion,
    )
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
    const aiService = createAiService({
      apiKey: config.aiApiKey,
      baseUrl: config.aiBaseUrl,
      model: config.aiModel,
      timeoutMs: config.aiTimeoutMs,
    })
    const app = await buildApp(config, {
      healthService,
      authService,
      syncService,
      aiService,
      tokens,
    })

    const shutdown = createShutdown({
      app,
      database,
      logger: app.log,
      timeoutMs: SHUTDOWN_TIMEOUT_MS,
    })

    process.on('SIGTERM', () => void shutdown('SIGTERM'))
    process.on('SIGINT', () => void shutdown('SIGINT'))

    await app.listen({ host: config.host, port: config.port })
  } catch (err) {
    await database.close()
    throw err
  }
}

main().catch((error: unknown) => {
  // 启动期失败可能发生在 logger 就绪之前，手工输出单行结构化日志
  console.error(
    JSON.stringify({
      level: 'fatal',
      time: new Date().toISOString(),
      msg: 'startup failed',
      error: error instanceof Error ? error.message : String(error),
    }),
  )
  process.exit(1)
})
