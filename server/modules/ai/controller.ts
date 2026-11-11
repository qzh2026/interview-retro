import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { AiReviewRequest } from '../../../shared/api'
import type { AppConfig } from '../../config/env'
import { validate } from '../../core/validate'
import { authenticate } from '../auth/controller'
import type { TokenVerifier } from '../auth/tokens'
import type { AiService } from './service'

/** 控制器：鉴权、校验、限流、调用服务，不写业务逻辑 */

const ReviewSchema = z.object({
  content: z.string().min(1).max(20000),
  myAnswer: z.string().max(20000),
  category: z.string().max(64),
  tags: z.array(z.string().min(1).max(32)).max(20).optional(),
})

export function registerAiRoutes(
  app: FastifyInstance,
  service: AiService,
  tokens: TokenVerifier,
  config: AppConfig,
): void {
  // 路由级限流：AI 调用产生真实成本，按 IP 限速（与 /api/auth/* 同一机制）
  const rateLimit = { rateLimit: { max: config.aiRateLimitMax, timeWindow: '1 minute' } }

  app.post('/api/ai/review', { config: rateLimit }, async (request) => {
    const claims = await authenticate(request, tokens)
    void claims // 身份已验证；当前所有登录用户同等可用，预留按用户配额的扩展点
    const input = validate(ReviewSchema, request.body) as AiReviewRequest
    return service.review(input)
  })
}
