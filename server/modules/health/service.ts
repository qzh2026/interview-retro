import type { HealthResponse, ReadyResponse } from '../../../shared/api'
import { AppError } from '../../errors/app-error'
import type { HealthRepository } from './repository'

/** 服务层：承载业务规则，完全不依赖 HTTP 请求 / 响应对象 */
export interface HealthService {
  liveness(): HealthResponse
  readiness(): Promise<ReadyResponse>
}

export function createHealthService(repo: HealthRepository, version: string): HealthService {
  const startedAt = Date.now()

  return {
    liveness(): HealthResponse {
      return {
        status: 'ok',
        version,
        uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
        timestamp: new Date().toISOString(),
      }
    },

    async readiness(): Promise<ReadyResponse> {
      try {
        const schemaReady = await repo.probe()
        if (!schemaReady) throw new Error('schema not applied')
        return { status: 'ready', database: 'ok', timestamp: new Date().toISOString() }
      } catch (cause) {
        // 数据库细节只留在服务端日志链路里，客户端拿到统一的可读提示
        throw new AppError('SERVICE_UNAVAILABLE', 503, '服务尚未就绪，请稍后重试', undefined, {
          cause,
        })
      }
    },
  }
}
