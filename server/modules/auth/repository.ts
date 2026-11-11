import { and, eq, isNull } from 'drizzle-orm'
import type { Database } from '../../db/client'
import { refreshTokens, users } from '../../db/schema'

/** 仓储层：只做数据访问，不写业务判定 */
export interface UserRow {
  id: string
  email: string
  passwordHash: string
  displayName: string | null
}

export interface RefreshTokenRow {
  id: string
  userId: string
  tokenHash: string
  expiresAt: Date
  revokedAt: Date | null
}

export interface AuthRepository {
  findUserByEmail(email: string): Promise<UserRow | null>
  findUserById(id: string): Promise<UserRow | null>
  createUser(row: UserRow): Promise<void>
  insertRefreshToken(row: { id: string; userId: string; tokenHash: string; expiresAt: Date }): Promise<void>
  findRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenRow | null>
  revokeRefreshToken(id: string, at: Date): Promise<void>
  revokeAllUserTokens(userId: string, at: Date): Promise<void>
}

export function createAuthRepository(db: Database['db']): AuthRepository {
  return {
    async findUserByEmail(email) {
      const rows = await db.select().from(users).where(eq(users.email, email)).limit(1)
      return rows[0] ?? null
    },

    async findUserById(id) {
      const rows = await db.select().from(users).where(eq(users.id, id)).limit(1)
      return rows[0] ?? null
    },

    async createUser(row) {
      await db.insert(users).values(row)
    },

    async insertRefreshToken(row) {
      await db.insert(refreshTokens).values(row)
    },

    async findRefreshTokenByHash(tokenHash) {
      const rows = await db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.tokenHash, tokenHash))
        .limit(1)
      return rows[0] ?? null
    },

    async revokeRefreshToken(id, at) {
      await db
        .update(refreshTokens)
        .set({ revokedAt: at })
        .where(and(eq(refreshTokens.id, id), isNull(refreshTokens.revokedAt)))
    },

    async revokeAllUserTokens(userId, at) {
      await db
        .update(refreshTokens)
        .set({ revokedAt: at })
        .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)))
    },
  }
}
