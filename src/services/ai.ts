/**
 * AI 扩展点兼容层。
 *
 * 真实实现由插件通过 ctx.useAiAdapter(...) 注入，核心代码只从这里取当前生效的适配器。
 * 接入大模型时必须走后端代理 / 云函数保管 API Key，
 * 绝不能把密钥写进前端（Vite 的 import.meta.env 会原样打进产物）。
 */
import { getAiAdapter } from '@/core/extensions/registry'
import type { AiReviewOptions, AiReviewRequest, AiReviewResponse } from '@/sdk/types'

export type { AiAdapter, AiReviewOptions, AiReviewRequest, AiReviewResponse } from '@/sdk/types'

export function isAiEnabled(): boolean {
  return getAiAdapter().id !== 'core:disabled'
}

export function reviewWithAi(req: AiReviewRequest, options?: AiReviewOptions): Promise<AiReviewResponse> {
  return getAiAdapter().review(req, options)
}
