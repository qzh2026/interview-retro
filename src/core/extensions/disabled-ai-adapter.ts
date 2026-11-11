import type { AiAdapter, AiReviewResponse } from '@/sdk/types'

/**
 * 默认 AI 适配器：明确禁用。
 * 接入真实模型时请实现 AiAdapter 并在插件里 useAiAdapter(...)，
 * 密钥必须放在后端代理 / 云函数，禁止写进前端环境变量。
 */
export const disabledAiAdapter: AiAdapter = {
  id: 'core:disabled',
  label: '未启用',
  async review(): Promise<AiReviewResponse> {
    throw new Error('AI 复盘尚未启用：请先实现 AiAdapter 并通过 useAiAdapter 注入')
  },
}
