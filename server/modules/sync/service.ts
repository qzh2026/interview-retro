import type { SyncPullResponse, SyncPushRequest, SyncPushResponse } from '../../../shared/api'
import { ERROR_CODES } from '../../../shared/api'
import { AppError } from '../../errors/app-error'
import type { SyncRepository } from './repository'

/**
 * 服务层：增量同步业务规则，不依赖 HTTP 对象。
 *
 * 服务端是「哑变更日志」：只做幂等写入与增量读取，不参与 LWW 合并——
 * 合并发生在客户端，任何推送顺序都收敛到同一结果。
 */
export interface SyncService {
  push(userId: string, input: SyncPushRequest): Promise<SyncPushResponse>
  pull(userId: string, since: number): Promise<SyncPullResponse>
}

export function createSyncService(
  repo: SyncRepository,
  limits: { maxChangesPerPush: number; pullLimit: number },
): SyncService {
  return {
    async push(userId, input) {
      const changes = input.changes
      if (!Array.isArray(changes) || changes.length === 0) {
        throw AppError.badRequest('changes 不能为空')
      }
      if (changes.length > limits.maxChangesPerPush) {
        throw new AppError(
          ERROR_CODES.VALIDATION_ERROR,
          400,
          `单次最多推送 ${limits.maxChangesPerPush} 条变更`,
        )
      }
      const result = await repo.insertChanges(userId, changes)
      const cursor = await repo.maxSeq(userId)
      return { ...result, cursor }
    },

    async pull(userId, since) {
      const cursorBefore = Number.isFinite(since) && since >= 0 ? Math.floor(since) : 0
      const changes = await repo.listChanges(userId, cursorBefore, limits.pullLimit)
      const cursor =
        changes.length > 0 ? changes[changes.length - 1].seq : await repo.maxSeq(userId)
      return { cursor, changes }
    },
  }
}
