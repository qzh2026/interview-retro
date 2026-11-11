import { defineConfig } from 'drizzle-kit'

/**
 * drizzle-kit generate 只根据 schema 生成 SQL，不需要连接数据库。
 * 生成的迁移文件必须随源码提交；回滚靠版本控制 + 手工 down 脚本，
 * 不要在运行时用 synchronize 之类的隐式建表。
 */
export default defineConfig({
  schema: './server/db/schema.ts',
  out: './server/db/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'file:./server/data/interview-retro.db',
  },
  strict: true,
  verbose: true,
})
