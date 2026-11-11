import type { FastifyInstance } from 'fastify'
import { and, eq } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import type {
  ApiErrorBody,
  SyncChangeInput,
  SyncPullResponse,
  SyncPushResponse,
} from '../../shared/api'
import { tombstones } from '../../server/db/schema'
import { makeTestApp, registerUser } from './app-helpers'

let app: FastifyInstance | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

function change(id: string, over: Partial<SyncChangeInput> = {}): SyncChangeInput {
  return {
    changeId: id,
    entityType: 'question',
    entityId: 'q-1',
    op: 'upsert',
    updatedAt: 1_000,
    fields: { content: '什么是闭包？' },
    ...over,
  }
}

function bearer(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` }
}

async function push(
  app: FastifyInstance,
  token: string,
  changes: SyncChangeInput[],
): Promise<{ statusCode: number; body: SyncPushResponse | ApiErrorBody }> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/sync/push',
    headers: bearer(token),
    payload: { changes },
  })
  return { statusCode: res.statusCode, body: res.json() }
}

async function pull(
  app: FastifyInstance,
  token: string,
  since = 0,
): Promise<{ statusCode: number; body: SyncPullResponse | ApiErrorBody }> {
  const res = await app.inject({
    method: 'GET',
    url: `/api/sync/pull?since=${since}`,
    headers: bearer(token),
  })
  return { statusCode: res.statusCode, body: res.json() }
}

describe('push / pull 基本流程', () => {
  it('未携带访问令牌返回 401', async () => {
    const t = await makeTestApp()
    app = t.app
    const res = await app.inject({ method: 'GET', url: '/api/sync/pull' })
    expect(res.statusCode).toBe(401)
  })

  it('push 后 pull 按 seq 顺序返回变更', async () => {
    const t = await makeTestApp()
    app = t.app
    const u = await registerUser(app, 'sync@example.com')

    const pushed = await push(app, u.accessToken, [
      change('change-001'),
      change('change-002', { entityId: 'q-2', updatedAt: 2_000 }),
    ])
    expect(pushed.statusCode).toBe(200)
    expect(pushed.body).toMatchObject({ accepted: 2, duplicates: 0, cursor: 2 })

    const pulled = await pull(app, u.accessToken, 0)
    expect(pulled.statusCode).toBe(200)
    const body = pulled.body as SyncPullResponse
    expect(body.cursor).toBe(2)
    expect(body.changes.map((c) => c.seq)).toEqual([1, 2])
    expect(body.changes[0]).toMatchObject({ changeId: 'change-001', entityId: 'q-1' })
    expect(body.changes[0].fields).toEqual({ content: '什么是闭包？' })
  })

  it('pull 增量游标：since=1 只返回之后的变更', async () => {
    const t = await makeTestApp()
    app = t.app
    const u = await registerUser(app, 'cursor@example.com')
    await push(app, u.accessToken, [
      change('change-c01'),
      change('change-c02'),
      change('change-c03'),
    ])

    const pulled = await pull(app, u.accessToken, 1)
    const body = pulled.body as SyncPullResponse
    expect(body.changes.map((c) => c.changeId)).toEqual(['change-c02', 'change-c03'])
    expect(body.cursor).toBe(3)
  })

  it('空库 pull 返回空数组与游标 0', async () => {
    const t = await makeTestApp()
    app = t.app
    const u = await registerUser(app, 'empty@example.com')
    const pulled = await pull(app, u.accessToken, 0)
    expect(pulled.body).toEqual({ cursor: 0, changes: [] })
  })
})

describe('幂等与边界', () => {
  it('同 changeId 重复推送被跳过（重试安全）', async () => {
    const t = await makeTestApp()
    app = t.app
    const u = await registerUser(app, 'idem@example.com')

    const first = await push(app, u.accessToken, [change('idem-same-1'), change('idem-same-2')])
    expect(first.body).toMatchObject({ accepted: 2, duplicates: 0 })

    const replay = await push(app, u.accessToken, [change('idem-same-1'), change('idem-same-2')])
    expect(replay.statusCode).toBe(200)
    expect(replay.body).toMatchObject({ accepted: 0, duplicates: 2, cursor: 2 })

    const pulled = await pull(app, u.accessToken, 0)
    expect((pulled.body as SyncPullResponse).changes).toHaveLength(2)
  })

  it('超过单批上限返回 400', async () => {
    const t = await makeTestApp({ env: { SYNC_MAX_CHANGES_PER_PUSH: '3' } })
    app = t.app
    const u = await registerUser(app, 'batch@example.com')
    const many = Array.from({ length: 4 }, (_, i) => change(`batch-change-${i}`))
    const res = await push(app, u.accessToken, many)
    expect(res.statusCode).toBe(400)
    expect((res.body as ApiErrorBody).error.code).toBe('VALIDATION_ERROR')
  })

  it('空 changes 返回 400', async () => {
    const t = await makeTestApp()
    app = t.app
    const u = await registerUser(app, 'none@example.com')
    const res = await app.inject({
      method: 'POST',
      url: '/api/sync/push',
      headers: bearer(u.accessToken),
      payload: { changes: [] },
    })
    expect(res.statusCode).toBe(400)
  })

  it('用户隔离：只能拉到自己的变更', async () => {
    const t = await makeTestApp()
    app = t.app
    const a = await registerUser(app, 'a@example.com')
    const b = await registerUser(app, 'b@example.com')

    await push(app, a.accessToken, [change('usera-change-1')])
    await push(app, b.accessToken, [change('userb-change-1', { entityId: 'q-9' })])

    const pulledA = (await pull(app, a.accessToken, 0)).body as SyncPullResponse
    const pulledB = (await pull(app, b.accessToken, 0)).body as SyncPullResponse
    expect(pulledA.changes.map((c) => c.changeId)).toEqual(['usera-change-1'])
    expect(pulledB.changes.map((c) => c.changeId)).toEqual(['userb-change-1'])
  })
})

describe('墓碑物化（LWW）', () => {
  it('delete 写入墓碑，更新的 upsert 使其复活', async () => {
    const t = await makeTestApp()
    app = t.app
    const u = await registerUser(app, 'tomb@example.com')

    await push(app, u.accessToken, [change('delete-chg-1', { op: 'delete', updatedAt: 1_000 })])
    let rows = await t.database.db.select().from(tombstones).where(eq(tombstones.userId, u.userId))
    expect(rows).toHaveLength(1)

    await push(app, u.accessToken, [
      change('upsert-chg-1', { op: 'upsert', updatedAt: 2_000, fields: { content: '复活' } }),
    ])
    rows = await t.database.db.select().from(tombstones).where(eq(tombstones.userId, u.userId))
    expect(rows).toHaveLength(0)
  })

  it('更旧的 delete 不覆盖新墓碑，也不产生第二条', async () => {
    const t = await makeTestApp()
    app = t.app
    const u = await registerUser(app, 'tomb2@example.com')

    await push(app, u.accessToken, [change('delete-new-1', { op: 'delete', updatedAt: 5_000 })])
    await push(app, u.accessToken, [change('delete-old-1', { op: 'delete', updatedAt: 1_000 })])

    const rows = await t.database.db
      .select()
      .from(tombstones)
      .where(and(eq(tombstones.userId, u.userId), eq(tombstones.entityId, 'q-1')))
    expect(rows).toHaveLength(1)
    expect(rows[0].deletedAt).toBe(5_000)
  })
})
