import { definePlugin } from '@/sdk'
import type { AiAdapter, AiReviewRequest, AiReviewResponse } from '@/sdk/types'
import { ApiClientError, request } from '@/services/cloud/http'
import { session } from '@/services/cloud/session'

/**
 * 云 AI 适配器：review() 走后端代理 POST /api/ai/review。
 *
 * 密钥只存在服务端环境变量（AI_API_KEY），前端产物里只有这个 HTTP 调用。
 * 后端未配置密钥时端点返回 AI_NOT_CONFIGURED，这里把服务端文案透传给页面。
 */
export function createCloudAiAdapter(): AiAdapter {
  return {
    id: 'builtin:cloud-ai',
    label: '云 AI 复盘',
    async review(req: AiReviewRequest): Promise<AiReviewResponse> {
      if (!session.accessToken) {
        throw new Error('请先登录后再使用 AI 复盘')
      }
      try {
        return await request<AiReviewResponse>('/api/ai/review', { method: 'POST', json: req })
      } catch (err) {
        // ApiClientError.message 已是服务端下发的中文可读文案，直接转成普通 Error
        if (err instanceof ApiClientError) throw new Error(err.message)
        throw err
      }
    },
  }
}

/**
 * 内置插件：云 AI 复盘。
 *
 * 通过 useAiAdapter 注入（替换型扩展点，后注册覆盖）。
 * 产品默认不消费 AI（UI 无入口）；管道备好，登录 + 服务端配置密钥后即可用。
 */
export default definePlugin({
  manifest: {
    id: 'builtin:cloud-ai',
    name: '云 AI 复盘',
    version: '1.0.0',
    description: '经后端代理调用大模型生成复盘建议；API 密钥只存服务端，绝不进前端产物',
    contributes: ['aiAdapter'],
  },

  setup({ useAiAdapter, log }) {
    useAiAdapter(createCloudAiAdapter())
    log('AI 复盘适配器已注入（后端未配置密钥时调用会返回「未启用」提示）')
  },
})
