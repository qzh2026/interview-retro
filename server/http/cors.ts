import cors from '@fastify/cors'
import type { FastifyInstance } from 'fastify'
import type { AppConfig } from '../config/env'

/**
 * CORS 使用显式来源白名单（配置层已禁止生产环境出现通配符）。
 * credentials 为 Stage 4 的 HttpOnly 刷新令牌 Cookie 预留。
 */
export async function registerCors(app: FastifyInstance, config: AppConfig): Promise<void> {
  await app.register(cors, {
    origin: config.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    maxAge: 600,
  })
}
