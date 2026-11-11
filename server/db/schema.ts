import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

/**
 * 服务端数据归属的唯一入口。
 *
 * 注意：ownerId / userId 只存在于服务端表与同步层，绝不进入前端
 * Interview / Question 类型或 BackupPayload —— 否则所有历史 JSON 备份都会失效。
 *
 * Stage 3 只建鉴权地基；sync_changes / tombstones 留到 Stage 4 的第二个迁移，
 * 避免在本阶段把尚未定稿的冲突合并策略硬编码进 schema。
 */

/** 单用户起步，但保留用户表以便后续 RBAC 与多用户演进 */
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
})

/** 刷新令牌只存 hash：泄露数据库也无法直接冒用，且服务端可主动撤销 */
export const refreshTokens = sqliteTable('refresh_tokens', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  revokedAt: integer('revoked_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
})

/**
 * 变更日志（append-only）。服务端不参与冲突合并，只保证：
 * - changeId 幂等（重复 push 跳过）；
 * - seq 单调递增（pull 的增量游标）；
 * - 按 user_id 隔离。
 * 客户端拉取后按字段级 LWW 自行收敛，因此任意推送顺序都收敛到同一结果。
 */
export const syncChanges = sqliteTable('sync_changes', {
  seq: integer('seq').primaryKey({ autoIncrement: true }),
  changeId: text('change_id').notNull().unique(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  op: text('op').notNull(),
  /** JSON：{ updatedAt: number, fields?: Record<string, unknown> } */
  payload: text('payload'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
}, (t) => [
  // pull 的增量查询路径：WHERE user_id = ? AND seq > ? ORDER BY seq
  index('sync_changes_user_seq_idx').on(t.userId, t.seq),
])

/**
 * 墓碑物化视图：当前处于「已删除」状态的实体。
 * 变更日志里同样有对应 delete 记录；此表只是查询优化与未来日志压缩的依据。
 * deletedAt 是客户端毫秒时间戳，参与 LWW 比较。
 */
export const tombstones = sqliteTable('tombstones', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  deletedAt: integer('deleted_at').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
}, (t) => [
  // 同一实体只允许一条墓碑
  uniqueIndex('tombstones_user_entity_unique').on(t.userId, t.entityType, t.entityId),
])

export const schema = { users, refreshTokens, syncChanges, tombstones }
