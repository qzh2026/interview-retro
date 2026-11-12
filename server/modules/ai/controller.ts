import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { AiReviewRequest } from '../../../shared/api'
import type { AppConfig } from '../../config/env'
import { validate } from '../../core/validate'
import { authenticate } from '../auth/controller'
import type { TokenVerifier } from '../auth/tokens'
import type { AiService } from './service'

/** 控制器：鉴权、校验、限流、调用服务，不写业务逻辑 */

/**
 * 知识点标签常是中文长句（如「技术架构表达与选型理由（RAG 链路 / Agent 编排 / …）」），
 * 领域模型 tags: string[] 本身没有长度约束。早期这里设的 32 字 / 20 个会把真实数据误判为 400，
 * 因此放宽到与领域模型一致，只保留防御性上限，避免超大 payload 打爆上游 prompt。
 */
const TAG_MAX_LENGTH = 200
const TAGS_MAX_COUNT = 50

const ReviewSchema = z.object({
  content: z
    .string()
    .min(1, { message: '题目内容不能为空' })
    .max(20000, { message: '题目内容不能超过 20000 字' }),
  myAnswer: z.string().max(20000, { message: '我的回答不能超过 20000 字' }),
  category: z.string().max(64, { message: '分类名称不能超过 64 字' }),
  tags: z
    .array(
      z
        .string()
        .min(1, { message: '标签不能为空' })
        .max(TAG_MAX_LENGTH, { message: `单个标签不能超过 ${TAG_MAX_LENGTH} 字` }),
    )
    .max(TAGS_MAX_COUNT, { message: `标签最多 ${TAGS_MAX_COUNT} 个` })
    .optional(),
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
