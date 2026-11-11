import { and, eq, gt, sql } from 'drizzle-orm'
import type { SyncChangeInput, SyncChangeRecord, SyncEntityType, SyncOp } from '../../../shared/api'
import type { Database } from '../../db/client'
import { syncChanges, tombstones } from '../../db/schema'

/** 仓储层：只做数据访问，不写业务判定 */
export interface SyncRepository {
  /** 批量写入变更（按 changeId 幂等）；整批在一个事务里 */
  insertChanges(
    userId: string,
    changes: SyncChangeInput[],
  ): Promise<{ accepted: number; duplicates: number }>
  /** 读取 seq > since 的变更，按 seq 升序 */
  listChanges(userId: string, since: number, limit: number): Promise<SyncChangeRecord[]>
  /** 当前用户最大 seq（无数据为 0） */
  maxSeq(userId: string): Promise<number>
}

interface PayloadShape {
  updatedAt: number
  fields?: Record<string, unknown>
}

function toRecord(row: {
  seq: number
  changeId: string
  entityType: string
  entityId: string
  op: string
  payload: string | null
}): SyncChangeRecord {
  let payload: PayloadShape = { updatedAt: 0 }
  try {
    const parsed = JSON.parse(row.payload ?? '{}') as unknown
    if (typeof parsed === 'object' && parsed !== null) payload = parsed as PayloadShape
  } catch {
    // payload 损坏时保留骨架，客户端 LWW 会把它当作最旧变更跳过
  }
  return {
    seq: row.seq,
    changeId: row.changeId,
    entityType: row.entityType as SyncEntityType,
    entityId: row.entityId,
    op: row.op as SyncOp,
    updatedAt: typeof payload.updatedAt === 'number' ? payload.updatedAt : 0,
    ...(payload.fields ? { fields: payload.fields } : {}),
  }
}

export function createSyncRepository(db: Database['db']): SyncRepository {
  return {
    async insertChanges(userId, changes) {
      if (changes.length === 0) return { accepted: 0, duplicates: 0 }

      return db.transaction(async (tx) => {
        let accepted = 0
        let duplicates = 0

        for (const change of changes) {
          // 幂等键：同 changeId 重复推送直接跳过（客户端重试安全）
          const existing = await tx
            .select({ seq: syncChanges.seq })
            .from(syncChanges)
            .where(eq(syncChanges.changeId, change.changeId))
            .limit(1)
          if (existing.length > 0) {
            duplicates += 1
            continue
          }

          await tx.insert(syncChanges).values({
            changeId: change.changeId,
            userId,
            entityType: change.entityType,
            entityId: change.entityId,
            op: change.op,
            payload: JSON.stringify({
              updatedAt: change.updatedAt,
              ...(change.fields ? { fields: change.fields } : {}),
            } satisfies PayloadShape),
          })
          accepted += 1

          if (change.op === 'delete') {
            // 墓碑物化：LWW，只有更新的删除才覆盖旧墓碑
            const current = await tx
              .select({ id: tombstones.id, deletedAt: tombstones.deletedAt })
              .from(tombstones)
              .where(
                and(
                  eq(tombstones.userId, userId),
                  eq(tombstones.entityType, change.entityType),
                  eq(tombstones.entityId, change.entityId),
                ),
              )
              .limit(1)
            const row = current[0]
            if (!row) {
              await tx.insert(tombstones).values({
                userId,
                entityType: change.entityType,
                entityId: change.entityId,
                deletedAt: change.updatedAt,
              })
            } else if (change.updatedAt > row.deletedAt) {
              await tx
                .update(tombstones)
                .set({ deletedAt: change.updatedAt })
                .where(eq(tombstones.id, row.id))
            }
          } else {
            // 复活：不早于墓碑时间的 upsert 使删除失效
            await tx
              .delete(tombstones)
              .where(
                and(
                  eq(tombstones.userId, userId),
                  eq(tombstones.entityType, change.entityType),
                  eq(tombstones.entityId, change.entityId),
                  sql`${tombstones.deletedAt} <= ${change.updatedAt}`,
                ),
              )
          }
        }

        return { accepted, duplicates }
      })
    },

    async listChanges(userId, since, limit) {
      const rows = await db
        .select({
          seq: syncChanges.seq,
          changeId: syncChanges.changeId,
          entityType: syncChanges.entityType,
          entityId: syncChanges.entityId,
          op: syncChanges.op,
          payload: syncChanges.payload,
        })
        .from(syncChanges)
        .where(and(eq(syncChanges.userId, userId), gt(syncChanges.seq, since)))
        .orderBy(syncChanges.seq)
        .limit(limit)
      return rows.map(toRecord)
    },

    async maxSeq(userId) {
      const rows = await db
        .select({ max: sql<number>`coalesce(max(${syncChanges.seq}), 0)` })
        .from(syncChanges)
        .where(eq(syncChanges.userId, userId))
      return Number(rows[0]?.max ?? 0)
    },
  }
}
