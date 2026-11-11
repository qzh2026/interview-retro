import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'
import { ConfigurationError } from '../errors/app-error'

/**
 * 集中配置：全部来自环境变量，启动时一次性校验，失败即快速退出。
 * 任何密钥都不写进代码，也绝不进入前端的 VITE_* 变量。
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  DATABASE_URL: z.string().min(1).default('file:./server/data/interview-retro.db'),
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://127.0.0.1:5173'),
  APP_VERSION: z.string().min(1).default('0.1.0'),
})

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production'
  isProduction: boolean
  host: string
  port: number
  logLevel: z.infer<typeof EnvSchema>['LOG_LEVEL']
  databaseUrl: string
  /** 显式来源白名单，生产环境禁止通配符 */
  corsOrigins: string[]
  appVersion: string
}

/**
 * 加载 .env（若存在）。使用 Node 20.12+ / 22 原生 process.loadEnvFile，
 * 不额外引入 dotenv；该文件已被 .gitignore 忽略，已存在的 process.env 优先不被覆盖，
 * 方便 CI 与容器通过环境变量注入配置。
 */
export function loadEnvFileIfPresent(path: string = resolve(process.cwd(), '.env')): void {
  if (!existsSync(path)) return
  if (typeof process.loadEnvFile !== 'function') {
    throw new ConfigurationError('当前 Node 版本不支持 process.loadEnvFile，请使用 Node 20.12+ 或 22+')
  }
  process.loadEnvFile(path)
}

/** 纯函数，便于单测注入环境变量而不触碰真实文件 */
export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.safeParse(source)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    throw new ConfigurationError(`环境变量校验失败 → ${issues.join('; ')}`)
  }

  const raw = parsed.data
  const corsOrigins = [
    ...new Set(raw.CORS_ORIGINS.split(',').map((item) => item.trim()).filter(Boolean)),
  ]
  if (corsOrigins.length === 0) {
    throw new ConfigurationError('CORS_ORIGINS 至少需要配置一个明确的来源')
  }
  if (raw.NODE_ENV === 'production' && corsOrigins.includes('*')) {
    throw new ConfigurationError('生产环境禁止 CORS 通配符，请配置显式来源白名单')
  }

  return {
    nodeEnv: raw.NODE_ENV,
    isProduction: raw.NODE_ENV === 'production',
    host: raw.HOST,
    port: raw.PORT,
    logLevel: raw.LOG_LEVEL,
    databaseUrl: raw.DATABASE_URL,
    corsOrigins,
    appVersion: raw.APP_VERSION,
  }
}
