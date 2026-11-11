import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { SyncPushRequest } from '../../../shared/api'
import { validate } from '../../core/validate'
import { authenticate } from '../auth/controller'
import type { TokenVerifier } from '../auth/tokens'
import type { SyncService } from './service'

/** 控制器：解析请求、鉴权、调用服务，不写业务逻辑 */

const SyncEntityTypeSchema = z.enum(['interview', 'question', 'settings'])

const PushSchema = z.object({
  changes: z
    .array(
      z.object({
        changeId: z.string().min(8).max(64),
        entityType: SyncEntityTypeSchema,
        entityId: z.string().min(1).max(64),
        op: z.enum(['upsert', 'delete']),
        updatedAt: z.number().int().nonnegative(),
        fields: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .min(1),
})

const PullQuerySchema = z.object({
  since: z.coerce.number().int().nonnegative().default(0),
})

export function registerSyncRoutes(
  app: FastifyInstance,
  service: SyncService,
  tokens: TokenVerifier,
): void {
  app.post('/api/sync/push', async (request) => {
    const claims = await authenticate(request, tokens)
    const input = validate(PushSchema, request.body) as SyncPushRequest
    return service.push(claims.userId, input)
  })

  app.get('/api/sync/pull', async (request) => {
    const claims = await authenticate(request, tokens)
    const { since } = validate(PullQuerySchema, request.query)
    return service.pull(claims.userId, since)
  })
}
