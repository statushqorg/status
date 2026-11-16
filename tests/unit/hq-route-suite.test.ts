import type { HqApp } from '../../app/Hq/adapter'
import type { RouteCheck } from '../../app/Hq/routeSuite'
import type { RouteSyncDeps, SuiteMonitor } from '../../app/Hq/sync'
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checkableOrigin, evaluateSuite, normalizeCheck, normalizeManifest, reconcile, routeCheckLimit, runCheck, runSuite, statusMatches, suiteFromConfig } from '../../app/Hq/routeSuite'
import { ROUTE_SUITE_INTERVAL_SECONDS, syncRoutes } from '../../app/Hq/sync'

const APP: HqApp = { id: 1, teamId: 10, name: 'votescape', ingestKey: 'i', readKey: 'r', monitorId: null }
const get = (path: string, kind: RouteCheck['kind'] = 'public', expect: string[] = ['2xx', '3xx']): RouteCheck => ({ id: `GET ${path}`, method: 'GET', path, kind, expect })
const guard = (method: string, path: string): RouteCheck => ({ id: `${method} ${path}`, method, path, kind: 'guard', expect: ['401', '403', '419', '3xx'], send: 'empty-json' })
const MANIFEST = { version: 1, checks: [get('/', 'page'), get('/api/status'), guard('POST', '/api/monitors')] }

describe('what is accepted off the wire', () => {
  test('a GET and a write that must be refused are kept as sent', () => {
    expect(normalizeCheck(get('/api/status'))).toEqual({ check: get('/api/status') })
    expect(normalizeCheck(guard('DELETE', '/api/account'))).toEqual({ check: guard('DELETE', '/api/account') })
    expect(normalizeCheck({ method: 'post', path: '/api/login', kind: 'validation', expect: [422, '419'], send: 'empty-json' }))
      .toEqual({ check: { id: 'POST /api/login', method: 'POST', path: '/api/login', kind: 'validation', expect: ['422', '419'], send: 'empty-json' } })
  })

  test('a write that could succeed is refused, whoever built the manifest', () => {
    for (const entry of [
      { method: 'POST', path: '/api/things', kind: 'validation', expect: ['2xx'] },
      { method: 'POST', path: '/api/things', kind: 'guard', expect: ['401', '201'] },
      { method: 'DELETE', path: '/api/things', kind: 'public', expect: ['401'] },
      { method: 'PUT', path: '/api/things', kind: 'page', expect: ['422'] },
    ])
      expect(normalizeCheck(entry)).toHaveProperty('reason')
  })

  test('anything that is not a plain check is refused with a reason', () => {
    for (const entry of [
      { method: 'TRACE', path: '/x', kind: 'public', expect: ['2xx'] },
      { method: 'GET', path: 'x', kind: 'public', expect: ['2xx'] },
      { method: 'GET', path: '//evil.test/x', kind: 'public', expect: ['2xx'] },
      { method: 'GET', path: '/posts/{id}', kind: 'public', expect: ['2xx'] },
      { method: 'GET', path: '/a/../b', kind: 'public', expect: ['2xx'] },
      { method: 'GET', path: `/${'a'.repeat(600)}`, kind: 'public', expect: ['2xx'] },
      { method: 'GET', path: '/x', kind: 'nope', expect: ['2xx'] },
      { method: 'GET', path: '/x', kind: 'public', expect: ['ok'] },
      { method: 'GET', path: '/x', kind: 'public', expect: ['2xx'], send: 'empty-json' },
      null,
      'GET /x',
    ])
      expect(normalizeCheck(entry)).toHaveProperty('reason')
  })

  test('a manifest keeps what a visitor sees when the plan cuts it', () => {
    const many = [guard('POST', '/api/a'), get('/api/b'), get('/', 'page'), get('/api/a')]
    const result = normalizeManifest({ checks: [...many, { method: 'TRACE', path: '/x' }] }, 2)
    expect(result).not.toHaveProperty('error')
    const { checks, notMonitored } = result as Exclude<typeof result, { error: string }>
    expect(checks.map(check => check.id)).toEqual(['GET /', 'GET /api/a'])
    expect(notMonitored).toEqual([
      { id: 'TRACE /x', reason: 'not a method a check can use' },
      { id: 'GET /api/b', reason: 'over this plan\'s 2 route checks for an app' },
      { id: 'POST /api/a', reason: 'over this plan\'s 2 route checks for an app' },
    ])
  })

  test('a manifest that is not one is an error, and plans have allowances', () => {
    expect(normalizeManifest({}, 50)).toEqual({ error: 'manifest.checks must be a list' })
    expect(normalizeManifest({ checks: Array.from({ length: 2001 }, () => get('/x')) }, 50)).toHaveProperty('error')
    expect(routeCheckLimit('free')).toBe(50)
    expect(routeCheckLimit('pro')).toBe(500)
    expect(routeCheckLimit('something-new')).toBe(50)
  })

  test('only a public web address may be checked', () => {
    expect(checkableOrigin('https://votescape.org/path?x=1')).toBe('https://votescape.org')
    for (const address of ['http://localhost:3000', 'https://app.localhost', 'http://127.0.0.1', 'http://10.0.0.5', 'http://192.168.1.1', 'http://172.20.0.1', 'http://169.254.169.254', 'http://[::1]', 'file:///etc/passwd', 'https://user:pass@votescape.org', 'ftp://votescape.org', 'not a url', '', null, 42])
      expect(checkableOrigin(address)).toBeNull()
  })
})

describe('one sync against the last', () => {
  test('counts what was added, changed, removed and left alone', () => {
    const before = [get('/'), get('/api/a'), get('/api/old')]
    const after = [get('/'), get('/api/a', 'guard', ['401']), get('/api/new')]
    expect(reconcile(before, after)).toEqual({ total: 3, added: 1, changed: 1, removed: 1, unchanged: 1 })
    expect(reconcile(after, after)).toEqual({ total: 3, added: 0, changed: 0, removed: 0, unchanged: 3 })
  })
})

describe('asking a route', () => {
  const answering = (status: number | (() => never)) => async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    if (typeof status === 'function')
      status()
    return new Response('x', { status: status as number })
  }
  let calls: Array<{ url: string, init: RequestInit }> = []

  test('a GET is asked plainly, and a redirect is an answer, not followed', async () => {
    calls = []
    const result = await runCheck('https://votescape.org', get('/pricing', 'page'), { fetch: answering(302), now: () => 0 })
    expect(result).toEqual({ id: 'GET /pricing', ok: true, status: 302, ms: 0 })
    expect(calls[0]!.url).toBe('https://votescape.org/pricing')
    expect(calls[0]!.init.redirect).toBe('manual')
    expect(calls[0]!.init.body).toBeUndefined()
  })

  test('a write is sent an empty JSON body and must be refused', async () => {
    calls = []
    expect((await runCheck('https://votescape.org', guard('POST', '/api/monitors'), { fetch: answering(401) })).ok).toBe(true)
    expect(calls[0]!.init.method).toBe('POST')
    expect(calls[0]!.init.body).toBe('{}')
    const accepted = await runCheck('https://votescape.org', guard('POST', '/api/monitors'), { fetch: answering(201) })
    expect(accepted).toMatchObject({ ok: false, status: 201, why: 'answered 201, expected 401 or 403 or 419 or 3xx' })
  })

  test('nothing answering is a failure with no status', async () => {
    const down = await runCheck('https://votescape.org', get('/'), { fetch: answering(() => { throw new Error('ECONNREFUSED') }) })
    expect(down).toMatchObject({ ok: false, status: null, why: 'could not be reached' })
    const slow = await runCheck('https://votescape.org', get('/'), { fetch: answering(() => { throw Object.assign(new Error('timed out'), { name: 'TimeoutError' }) }) })
    expect(slow.why).toBe('did not answer in time')
  })

  test('a suite asks every check, in order, a few at a time', async () => {
    let inFlight = 0
    let most = 0
    const checks = Array.from({ length: 20 }, (_, i) => get(`/p${i}`))
    const results = await runSuite({ baseUrl: 'https://votescape.org', checks }, {
      concurrency: 4,
      fetch: async () => {
        most = Math.max(most, ++inFlight)
        await Promise.resolve()
        inFlight--
        return new Response('', { status: 200 })
      },
    })
    expect(results.map(result => result.id)).toEqual(checks.map(check => check.id))
    expect(most).toBeLessThanOrEqual(4)
  })

  test('a status matches a class or one code', () => {
    expect(statusMatches(['2xx', '3xx'], 301)).toBe(true)
    expect(statusMatches(['401', '403'], 404)).toBe(false)
  })
})

describe('what a round means', () => {
  const ok = (id: string) => ({ id, ok: true, status: 200, ms: 40 })
  const bad = (id: string, status: number | null = 500) => ({ id, ok: false, status, ms: 90, why: status === null ? 'could not be reached' : `answered ${status}, expected 2xx or 3xx` })

  test('every route answering is up', () => {
    expect(evaluateSuite([ok('GET /'), ok('GET /a')])).toMatchObject({ status: 'up', message: 'All 2 routes answered as expected', slowestMs: 40 })
    expect(evaluateSuite([]).status).toBe('up')
  })

  test('some failing is degraded and names them', () => {
    const verdict = evaluateSuite([ok('GET /'), ok('GET /a'), ok('GET /b'), bad('GET /api/x')])
    expect(verdict.status).toBe('degraded')
    expect(verdict.message).toBe('1 of 4 routes failing: GET /api/x answered 500, expected 2xx or 3xx')
    expect(verdict.slowestMs).toBe(90)
  })

  test('half or more failing, or nothing reachable, is down', () => {
    expect(evaluateSuite([ok('GET /'), bad('GET /a')]).status).toBe('down')
    expect(evaluateSuite([bad('GET /', null), bad('GET /a', null)]).status).toBe('down')
  })

  test('a long list of failures is cut, with the count kept', () => {
    const verdict = evaluateSuite(Array.from({ length: 8 }, (_, i) => bad(`GET /p${i}`)))
    expect(verdict.message).toContain('8 of 8 routes failing')
    expect(verdict.message).toContain('and 3 more')
    expect(verdict.failing).toHaveLength(8)
  })
})

describe('a route sync', () => {
  function world(options: { monitors?: SuiteMonitor[], limit?: number, floor?: number, plan?: string, others?: number } = {}) {
    const monitors = (options.monitors ?? []).map(monitor => ({ ...monitor }))
    const links: Array<{ appId: number, monitorId: number | null }> = []
    const deps: RouteSyncDeps = {
      origin: () => 'https://statushq.test',
      plan: async () => ({ plan: options.plan ?? 'free', monitors: options.limit ?? 5, checkIntervalFloorSeconds: options.floor ?? 300 }),
      countMonitors: async teamId => monitors.filter(monitor => monitor.teamId === teamId).length + (options.others ?? 0),
      findMonitor: async id => monitors.find(monitor => monitor.id === id) ?? null,
      createMonitor: async (monitor) => {
        const created = { ...monitor, id: monitors.length + 100 }
        monitors.push(created)
        return created
      },
      updateMonitor: async (id, patch) => {
        Object.assign(monitors.find(monitor => monitor.id === id)!, patch)
      },
      linkMonitor: async (appId, monitorId) => {
        links.push({ appId, monitorId })
      },
      now: () => new Date('2026-03-10T12:00:00.000Z'),
    }
    return { deps, monitors, links }
  }
  const body = (manifest: unknown = MANIFEST, baseUrl = 'https://votescape.org/') => ({ baseUrl, manifest })

  test('the first sync makes the app\'s one monitor and says what it checks', async () => {
    const { deps, monitors, links } = world()
    const result = await syncRoutes(deps, APP, body())
    expect(result.status).toBe(200)
    expect(monitors).toHaveLength(1)
    expect(monitors[0]).toMatchObject({ teamId: 10, name: 'votescape routes', url: 'https://votescape.org', enabled: true, checkIntervalSeconds: ROUTE_SUITE_INTERVAL_SECONDS })
    expect(suiteFromConfig(monitors[0]!.config)).toMatchObject({ appId: 1, baseUrl: 'https://votescape.org', syncedAt: '2026-03-10T12:00:00.000Z' })
    expect(result.body).toEqual({
      monitor: { id: 100, name: 'votescape routes', dashboardUrl: 'https://statushq.test/dashboard/monitors/100', intervalSeconds: 300 },
      checks: { total: 3, added: 3, changed: 0, removed: 0, unchanged: 0 },
      notMonitored: [],
    })
    expect(links).toEqual([{ appId: 1, monitorId: 100 }])
  })

  test('sending the same routes again changes nothing', async () => {
    const { deps, monitors } = world()
    await syncRoutes(deps, APP, body())
    const again = await syncRoutes(deps, { ...APP, monitorId: 100 }, body())
    expect(monitors).toHaveLength(1)
    expect((again.body as { checks: unknown }).checks).toEqual({ total: 3, added: 0, changed: 0, removed: 0, unchanged: 3 })
  })

  test('a later sync adds new routes and retires ones that are gone', async () => {
    const { deps, monitors } = world()
    await syncRoutes(deps, APP, body())
    const next = { version: 1, checks: [get('/', 'page'), get('/api/status', 'guard', ['401']), get('/api/new')] }
    const result = await syncRoutes(deps, { ...APP, monitorId: 100 }, body(next))
    expect((result.body as { checks: unknown }).checks).toEqual({ total: 3, added: 1, changed: 1, removed: 1, unchanged: 1 })
    expect(suiteFromConfig(monitors[0]!.config)!.checks.map(check => check.id)).toEqual(['GET /', 'GET /api/new', 'GET /api/status'])
  })

  test('what somebody set on the monitor by hand is theirs', async () => {
    const { deps, monitors } = world()
    await syncRoutes(deps, APP, body())
    Object.assign(monitors[0]!, { name: 'Votescape, every route', enabled: false, checkIntervalSeconds: 900, config: { ...monitors[0]!.config, latencyThresholdMs: 800 } })
    await syncRoutes(deps, { ...APP, monitorId: 100 }, body())
    expect(monitors[0]).toMatchObject({ name: 'Votescape, every route', enabled: false, checkIntervalSeconds: 900 })
    expect(monitors[0]!.config.latencyThresholdMs).toBe(800)
  })

  test('a monitor that is not this app\'s suite is never touched', async () => {
    const handMade: SuiteMonitor = { id: 7, teamId: 10, name: 'votescape.org', url: 'https://votescape.org', enabled: true, checkIntervalSeconds: 60, config: {} }
    const otherApps: SuiteMonitor = { id: 8, teamId: 10, name: 'other routes', url: 'https://other.example', enabled: true, checkIntervalSeconds: 300, config: { routeSuite: { appId: 2, baseUrl: 'https://other.example', checks: [], syncedAt: '' } } }
    const otherTeams: SuiteMonitor = { id: 9, teamId: 99, name: 'votescape routes', url: 'https://votescape.org', enabled: true, checkIntervalSeconds: 300, config: { routeSuite: { appId: 1, baseUrl: 'https://votescape.org', checks: [], syncedAt: '' } } }
    for (const linked of [handMade, otherApps, otherTeams]) {
      const { deps, monitors } = world({ monitors: [handMade, otherApps, otherTeams] })
      const before = JSON.stringify(monitors.slice(0, 3))
      const result = await syncRoutes(deps, { ...APP, monitorId: linked.id }, body())
      expect(result.status).toBe(200)
      expect(JSON.stringify(monitors.slice(0, 3))).toBe(before)
      expect(monitors).toHaveLength(4)
    }
  })

  test('a deleted monitor is made again on the next sync', async () => {
    const { deps, monitors, links } = world()
    const result = await syncRoutes(deps, { ...APP, monitorId: 555 }, body())
    expect(result.status).toBe(200)
    expect(monitors).toHaveLength(1)
    expect(links).toEqual([{ appId: 1, monitorId: 100 }])
  })

  test('a team with no monitor left is told, and nothing is made', async () => {
    const { deps, monitors } = world({ limit: 5, others: 5 })
    const result = await syncRoutes(deps, APP, body())
    expect(result.status).toBe(402)
    expect(monitors).toHaveLength(0)
    expect((result.body as { error: string }).error).toContain('5 monitors and all are in use')
    expect((result.body as { notMonitored: unknown[] }).notMonitored).toHaveLength(3)
  })

  test('an app that already has its monitor syncs even when the plan is full', async () => {
    const { deps } = world({ limit: 1 })
    await syncRoutes(deps, APP, body())
    expect((await syncRoutes(deps, { ...APP, monitorId: 100 }, body())).status).toBe(200)
  })

  test('the interval respects the plan\'s floor, also for a monitor made before it rose', async () => {
    const slow = world({ floor: 600 })
    await syncRoutes(slow.deps, APP, body())
    expect(slow.monitors[0]!.checkIntervalSeconds).toBe(600)

    const risen = world({ floor: 300 })
    await syncRoutes(risen.deps, APP, body())
    risen.monitors[0]!.checkIntervalSeconds = 60
    await syncRoutes(risen.deps, { ...APP, monitorId: 100 }, body())
    expect(risen.monitors[0]!.checkIntervalSeconds).toBe(300)
  })

  test('routes over the plan\'s allowance are reported, not dropped silently', async () => {
    const { deps } = world()
    const checks = Array.from({ length: 60 }, (_, i) => get(`/p${String(i).padStart(2, '0')}`))
    const result = await syncRoutes(deps, APP, body({ version: 1, checks }))
    const report = result.body as { checks: { total: number }, notMonitored: Array<{ id: string, reason: string }> }
    expect(report.checks.total).toBe(50)
    expect(report.notMonitored).toHaveLength(10)
    expect(report.notMonitored[0]!.reason).toBe('over this plan\'s 50 route checks for an app')
  })

  test('an address that cannot be checked, or a manifest that is not one, is refused', async () => {
    const { deps, monitors } = world()
    expect((await syncRoutes(deps, APP, body(MANIFEST, 'http://localhost:3000'))).status).toBe(422)
    expect((await syncRoutes(deps, APP, body({ nope: true }))).status).toBe(422)
    expect((await syncRoutes(deps, APP, null)).status).toBe(422)
    expect(monitors).toHaveLength(0)
  })
})

describe('how it is wired', () => {
  const read = (path: string): string => readFileSync(join(import.meta.dir, '..', '..', path), 'utf8')

  test('the health job hands a suite over before anything else reads the monitor', () => {
    const job = read('app/Jobs/RunHealthCheck.ts')
    expect(job.indexOf('suiteFromConfig(config')).toBeGreaterThan(0)
    expect(job.indexOf('suiteFromConfig(config')).toBeLessThan(job.indexOf('const url = config.path'))
    expect(job).toContain('checkableOrigin(suite.baseUrl)')
  })

  test('a sync is authorised by the app key and by nothing in the body', () => {
    const action = read('app/Actions/Hq/SyncRoutesAction.ts')
    expect(action).toContain('appForIngestKey(sqlAppStore, bearerKey(request.headers))')
    expect(action).not.toContain('request.get(\'team')
    expect(action).not.toContain('request.get(\'app')
  })
})
