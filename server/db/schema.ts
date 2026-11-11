import { sql } from 'drizzle-orm'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

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

export const schema = { users, refreshTokens }
