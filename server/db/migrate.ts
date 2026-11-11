import { fileURLToPath } from 'node:url'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { schema } from './schema'

/** 迁移 SQL 随源码一起提交；运行时路径基于源码位置，tsx 直接执行时同样有效 */
export const MIGRATIONS_FOLDER = fileURLToPath(new URL('./migrations/', import.meta.url))

/**
 * 启动期执行未应用的迁移。migrate() 自带版本表，重复调用是幂等的。
 * 变更一律通过 drizzle-kit generate 产出的 SQL 文件，不在运行时隐式建表。
 */
export async function runMigrations(db: LibSQLDatabase<typeof schema>): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })
}
