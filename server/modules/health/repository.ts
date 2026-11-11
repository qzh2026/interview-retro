import type { Client } from '@libsql/client'

/** 仓储层：只做数据访问，不写业务判定 */
export interface HealthRepository {
  probe(): Promise<boolean>
}

export function createHealthRepository(client: Client): HealthRepository {
  return {
    async probe(): Promise<boolean> {
      // 一次查询同时验证「连得上」与「迁移已应用」：users 表存在才算就绪
      const result = await client.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'",
      )
      return result.rows.length > 0
    },
  }
}
