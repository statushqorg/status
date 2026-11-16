import type { ConnectGrant } from '@stacksjs/hq/service'
import type { AppStore, HqApp, HqUser } from '../../app/Hq/adapter'
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { confirmationCode, connectCodesMigrationSql, createHqService, createMemoryConnectCodeStore } from '@stacksjs/hq/service'
import { hqServiceContract } from '@stacksjs/hq/testing'
import { appForIngestKey, createStatushqAdapter, MONITORS_METER } from '../../app/Hq/adapter'
import { bearerKey, hashKey, looksLikeIngestKey, looksLikeReadKey, newIngestKey, newReadKey } from '../../app/Hq/keys'
import { rateLimit } from '../../app/Hq/limits'

const ROOT = join(import.meta.dir, '..', '..')
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8')
const ORIGIN = 'https://statushq.test'
const ALICE: HqUser = { id: 1, teamId: 10 }
const BOB: HqUser = { id: 2, teamId: 20 }

/** The `hq_apps` table, as much of it as the adapter touches. */
export function memoryApps(seed: HqApp[] = []): AppStore & { rows: HqApp[] } {
  const rows = seed.map(app => ({ ...app }))
  return {
    rows,
    async findByTeamAndName(teamId, name) {
      const found = rows.find(app => app.teamId === teamId && app.name.toLowerCase() === name.toLowerCase())
      return found ? { ...found } : null
    },
    async create(app) {
      const created: HqApp = { id: rows.length + 1, monitorId: null, ...app }
      rows.push(created)
      return { ...created }
    },
    async findByIngestKeyHash(hash) {
      const found = rows.find(app => hashKey(app.ingestKey) === hash)
      return found ? { ...found } : null
    },
    async findByReadKeyHash(hash) {
      const found = rows.find(app => hashKey(app.readKey) === hash)
      return found ? { ...found } : null
    },
  }
}

function setup(options: { apps?: HqApp[], monitors?: Record<number, { used: number, limit: number | null }> } = {}) {
  const apps = memoryApps(options.apps)
  const adapter = createStatushqAdapter({
    apps,
    codes: createMemoryConnectCodeStore(),
    origin: () => ORIGIN,
    monitors: async teamId => options.monitors?.[teamId] ?? { used: 0, limit: 5 },
  })
  const service = createHqService(adapter, { now: () => new Date('2026-03-10T12:00:00.000Z') })

  const call = async (path: string, init: { method?: string, body?: unknown, headers?: Record<string, string> } = {}) => {
    const response = await service.handle(new Request(`${ORIGIN}${path}`, {
      method: init.method ?? 'GET',
      headers: { ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }), ...init.headers },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    }))
    return { status: response!.status, body: await response!.json() as unknown }
  }
  const start = async (app: string) => (await call('/api/cli/connect', { method: 'POST', body: { app } })).body as { code: string, approveUrl: string, confirmCode: string }
  const connect = async (app: string, user: HqUser): Promise<ConnectGrant> => {
    const { code } = await start(app)
    await service.approveConnect(code, user, await confirmationCode(code))
    return (await call(`/api/cli/connect/${code}`)).body as ConnectGrant
  }
  const usage = (key?: string) => call('/api/v1/usage', { headers: key ? { Authorization: `Bearer ${key}` } : undefined })

  return { apps, adapter, service, call, start, connect, usage }
}

// The package's own suite, run against this adapter rather than the reference
// one: codes hashed at rest, single use under concurrent polls, expiry,
// project reuse, read-key refusal and the usage shape.
hqServiceContract('statushq', () => ({ adapter: setup().adapter, user: ALICE }))

describe('connect flow', () => {
  test('a new code points at this service\'s approve page and carries a confirmation code', async () => {
    const { start, call } = setup()
    const { code, approveUrl, confirmCode } = await start('votescape')
    expect(approveUrl).toBe(`${ORIGIN}/cli/connect?code=${code}`)
    expect(confirmCode).toBe(await confirmationCode(code))
    expect(await call(`/api/cli/connect/${code}`)).toEqual({ status: 200, body: { status: 'pending' } })
  })

  test('approving makes an app under the approver\'s team and hands over two different keys', async () => {
    const { connect, apps } = setup()
    const grant = await connect('votescape', ALICE)
    expect(apps.rows).toHaveLength(1)
    expect(apps.rows[0]).toMatchObject({ teamId: 10, name: 'votescape', monitorId: null })
    expect(grant.project).toEqual({ id: '1', name: 'votescape' })
    expect(looksLikeIngestKey(grant.ingestKey)).toBe(true)
    expect(looksLikeReadKey(grant.readKey)).toBe(true)
    expect(grant.ingestKey).not.toBe(grant.readKey)
    // Nothing is monitored until the app sends its routes.
    expect(grant.dashboardUrl).toBe(`${ORIGIN}/dashboard/monitors`)
  })

  test('without the confirmation code nothing is made', async () => {
    const { start, service, apps } = setup()
    const { code } = await start('votescape')
    expect(await service.approveConnect(code, ALICE, 'AAA-AAA')).toEqual({ ok: false, reason: 'confirmation_mismatch' })
    expect(await service.approveConnect(code, ALICE, undefined)).toEqual({ ok: false, reason: 'confirmation_mismatch' })
    expect(apps.rows).toHaveLength(0)
  })

  test('the same app from the same team keeps its keys, whatever the case of its name', async () => {
    const { connect, apps } = setup()
    const first = await connect('Votescape', ALICE)
    const second = await connect('votescape', ALICE)
    expect(second.project.id).toBe(first.project.id)
    expect(second.ingestKey).toBe(first.ingestKey)
    expect(second.readKey).toBe(first.readKey)
    expect(apps.rows).toHaveLength(1)
  })

  test('the same name in another team is another app with other keys', async () => {
    const { connect, apps } = setup()
    const alice = await connect('votescape', ALICE)
    const bob = await connect('votescape', BOB)
    expect(bob.project.id).not.toBe(alice.project.id)
    expect(bob.ingestKey).not.toBe(alice.ingestKey)
    expect(apps.rows.map(app => app.teamId)).toEqual([10, 20])
  })

  test('an app with a monitor is linked straight to it', async () => {
    const { connect } = setup({ apps: [{ id: 1, teamId: 10, name: 'votescape', ingestKey: newIngestKey(), readKey: newReadKey(), monitorId: 77 }] })
    expect((await connect('votescape', ALICE)).dashboardUrl).toBe(`${ORIGIN}/dashboard/monitors/77`)
  })

  test('a connect cannot be approved by somebody with no team', async () => {
    const { start, service } = setup()
    const { code } = await start('votescape')
    await expect(service.approveConnect(code, { id: 3, teamId: 0 }, await confirmationCode(code))).rejects.toBeInstanceOf(TypeError)
  })
})

describe('the keys', () => {
  test('usage is read with the read key, counted for the team, as a hard limit', async () => {
    const { connect, usage } = setup({ monitors: { 10: { used: 4, limit: 5 } } })
    const grant = await connect('votescape', ALICE)
    const answered = await usage(grant.readKey)
    expect(answered.status).toBe(200)
    expect(answered.body).toMatchObject([{ meter: MONITORS_METER, used: 4, limit: 5, state: 'warn' }])
  })

  test('the ingest key does not read, and nothing else does either', async () => {
    const { connect, usage } = setup()
    const grant = await connect('votescape', ALICE)
    for (const key of [undefined, grant.ingestKey, 'shq_read_short', `shq_read_${'x'.repeat(43)}`])
      expect((await usage(key)).status).toBe(401)
  })

  test('an app is found by its ingest key and by nothing else', async () => {
    const { connect, apps } = setup()
    const grant = await connect('votescape', ALICE)
    expect((await appForIngestKey(apps, grant.ingestKey))?.name).toBe('votescape')
    for (const presented of [grant.readKey, `shq_app_${'x'.repeat(43)}`, '', null, undefined, 42])
      expect(await appForIngestKey(apps, presented)).toBeNull()
  })

  test('a bearer key is read from the header, and only that form', () => {
    const headers = (value?: string) => ({ get: (name: string) => (name === 'authorization' ? value ?? null : null) })
    expect(bearerKey(headers('Bearer abc'))).toBe('abc')
    expect(bearerKey(headers('bearer   abc'))).toBe('abc')
    expect(bearerKey(headers('Basic abc'))).toBeNull()
    expect(bearerKey(headers())).toBeNull()
  })
})

describe('what ships with it', () => {
  const migration = read('database/migrations/0000000287-create-hq-connect-tables.sql')

  test('the migration carries the package\'s connect-code table and the apps table', () => {
    const flat = (sql: string): string => sql.replace(/\s+/g, '').toLowerCase()
    expect(flat(migration)).toContain(flat(connectCodesMigrationSql()[0]!))
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS hq_apps')
    expect(migration).toContain('hq_apps_ingest_key_hash_unique')
  })

  test('no comment in the migration has a semicolon the runner would split on', () => {
    for (const line of migration.split('\n').filter(line => line.startsWith('--')))
      expect(line).not.toContain(';')
  })

  test('the routes are mounted where the CLI calls them', () => {
    const routes = read('routes/api.ts')
    for (const line of [
      'route.post(\'/cli/connect\', \'Actions/Hq/StartConnectAction\').skipCsrf()',
      'route.get(\'/cli/connect/{code}\', \'Actions/Hq/PollConnectAction\')',
      'route.post(\'/cli/connect/{code}/approve\', \'Actions/Hq/ApproveConnectAction\').skipCsrf()',
      'route.get(\'/v1/usage\', \'Actions/Hq/UsageAction\')',
      'route.post(\'/v1/routes/sync\', \'Actions/Hq/SyncRoutesAction\').skipCsrf()',
    ])
      expect(routes).toContain(line)
  })

  test('the approve page asks for the confirmation code and never renders it', () => {
    const page = read('resources/views/cli/connect.stx')
    expect(page).toContain('name="confirm"')
    expect(page).toContain('JSON.stringify({ confirm: typed })')
    expect(page).not.toContain('confirmCode')
    expect(page).not.toContain('confirmationCode')
    // Shown to a person: no dash an editor would flag.
    expect(page.replace(/<script server>[\s\S]*?<\/script>/, '')).not.toMatch(/[–—]/)
  })

  test('the approve action checks origin, session and attempts before the code', () => {
    const action = read('app/Actions/Hq/ApproveConnectAction.ts')
    const order = ['sameOrigin(request.headers)', 'requireTeamId(request)', 'rateLimit(', 'hq.approveConnect(']
    const at = order.map(text => action.indexOf(text))
    expect(at.every(index => index > 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
  })

  test('guesses at the confirmation code are limited per person', () => {
    for (let i = 0; i < 10; i++)
      expect(rateLimit('hq-approve:t', 10, 60_000, 1000).ok).toBe(true)
    expect(rateLimit('hq-approve:t', 10, 60_000, 1000)).toMatchObject({ ok: false })
    expect(rateLimit('hq-approve:t', 10, 60_000, 62_000).ok).toBe(true)
  })
})
