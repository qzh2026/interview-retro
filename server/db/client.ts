import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createClient, type Client } from '@libsql/client'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'
import { schema } from './schema'

/**
 * 数据库连接。libSQL client 内部复用连接，整个进程只创建一个实例；
 * 生产切 PostgreSQL 时替换本文件的驱动与 drizzle 实例即可，上层 service 不动。
 */
export interface Database {
  client: Client
  db: LibSQLDatabase<typeof schema>
  close(): Promise<void>
}

export function createDatabase(url: string): Database {
  // file: 协议指向本地文件，父目录不存在时 libSQL 会报错，先建好（内存库跳过）
  if (url.startsWith('file:')) {
    const target = url.slice('file:'.length).split('?')[0]
    if (target && target !== ':memory:' && !target.startsWith(':memory:')) {
      mkdirSync(dirname(resolve(process.cwd(), target)), { recursive: true })
    }
  }

  const client = createClient({ url })
  const db = drizzle(client, { schema })

  return {
    client,
    db,
    async close(): Promise<void> {
      client.close()
    },
  }
}
