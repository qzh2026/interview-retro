import { existsSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
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
  /** JWT 签名密钥：生产必填（>=32 字符）；开发/测试缺省时生成临时密钥 */
  JWT_SECRET: z.string().min(32).optional(),
  /** 访问令牌有效期（秒），默认 15 分钟 */
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(86400).default(900),
  /** 刷新令牌有效期（天） */
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  /** /api/auth/* 每分钟每 IP 的请求上限（防暴力破解） */
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(10000).default(10),
  /** 单次 push 允许的最大变更条数 */
  SYNC_MAX_CHANGES_PER_PUSH: z.coerce.number().int().min(1).max(1000).default(200),
  /** 单次 pull 返回的最大变更条数 */
  SYNC_PULL_LIMIT: z.coerce.number().int().min(1).max(2000).default(500),
  /* ===== AI 代理（Stage 5）：全部可选，未配置时服务照常启动、AI 端点返回 AI_NOT_CONFIGURED ===== */
  /** 上游模型 API 密钥：只存服务端环境变量，禁止进入任何 VITE_* / 前端产物 */
  AI_API_KEY: z.string().optional(),
  /** OpenAI 兼容接口地址（DeepSeek / Kimi / Qwen / Moonshot / OpenAI 通用） */
  AI_BASE_URL: z.string().default('https://api.openai.com/v1'),
  /** 模型名（如 deepseek-chat / kimi-k2 / qwen-plus）；与 AI_API_KEY 同时存在才视为已启用 */
  AI_MODEL: z.string().optional(),
  /** 上游调用超时（毫秒） */
  AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300000).default(30000),
  /** /api/ai/review 每分钟每用户的请求上限 */
  AI_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(10000).default(10),
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
  /** JWT 签名密钥。开发/测试未配置时为进程级临时值（重启即失效，刷新令牌流会重新签发） */
  jwtSecret: string
  jwtAccessTtlSeconds: number
  refreshTokenTtlDays: number
  authRateLimitMax: number
  syncMaxChangesPerPush: number
  syncPullLimit: number
  /** AI 代理：密钥只存在这里，绝不下发前端。undefined = 未启用 */
  aiApiKey: string | undefined
  /** OpenAI 兼容接口地址 */
  aiBaseUrl: string
  /** 模型名；与 aiApiKey 同时存在才视为已启用 */
  aiModel: string | undefined
  aiTimeoutMs: number
  aiRateLimitMax: number
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

  let jwtSecret = raw.JWT_SECRET
  if (!jwtSecret) {
    if (raw.NODE_ENV === 'production') {
      throw new ConfigurationError('生产环境必须配置 JWT_SECRET（至少 32 字符）')
    }
    // 开发/测试临时密钥：仅本进程有效，重启后旧访问令牌失效（刷新令牌流会重新签发）
    jwtSecret = randomBytes(32).toString('hex')
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
    jwtSecret,
    jwtAccessTtlSeconds: raw.JWT_ACCESS_TTL_SECONDS,
    refreshTokenTtlDays: raw.REFRESH_TOKEN_TTL_DAYS,
    authRateLimitMax: raw.AUTH_RATE_LIMIT_MAX,
    syncMaxChangesPerPush: raw.SYNC_MAX_CHANGES_PER_PUSH,
    syncPullLimit: raw.SYNC_PULL_LIMIT,
    // 空串视同未配置（.env 占位值常见），避免空密钥发往上游
    aiApiKey: raw.AI_API_KEY?.trim() || undefined,
    aiBaseUrl: raw.AI_BASE_URL.replace(/\/$/, ''),
    aiModel: raw.AI_MODEL?.trim() || undefined,
    aiTimeoutMs: raw.AI_TIMEOUT_MS,
    aiRateLimitMax: raw.AI_RATE_LIMIT_MAX,
  }
}
