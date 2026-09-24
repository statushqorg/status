import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { processDirectives } from '@stacksjs/stx/process'
import { extractVariables } from '@stacksjs/stx/utils'

const viewPath = join(import.meta.dir, '../../resources/views/dashboard/monitors/[id].stx')
const source = readFileSync(viewPath, 'utf8')
const serverBlock = source.match(/<script server>([\s\S]*?)<\/script>/)?.[1]
if (!serverBlock)
  throw new Error('Monitor detail server block not found')

// Execute the real server block in its original order through STX. Substitute
// only I/O-backed imports with per-render fixtures, never globally mock auth or
// database modules. The async auth boundary is important: STX's static fallback
// cannot reconstruct AUTH_USER after an unrelated initialization error (#16).
const script = serverBlock.replace(/^import \{ (?:resolveHealedTeamContext|db|maintenanceIntervalsByMonitor|computeUptime, roundMsForInterval|suggestServerForMonitor) \} from [^\n]+\n/gm, '')

const fixtureMonitor = {
  id: 55,
  team_id: 7,
  name: 'Session regression monitor',
  url: 'https://monitor.example.test',
  type: 'uptime',
  status: 'up',
  enabled: true,
  check_interval_seconds: 60,
  server_id: null,
  config: '{}',
}

function fixtureDatabase() {
  return {
    selectFrom(table: string) {
      const filters: Array<[string, unknown]> = []
      const builder = {
        where(column: string, operator: string, value: unknown) {
          if (table === 'monitors') {
            expect(operator).toBe('=')
            filters.push([column, value])
          }
          return builder
        },
        select() { return builder },
        orderBy() { return builder },
        limit() { return builder },
        async execute() {
          if (table !== 'monitors') return []
          const row = fixtureMonitor as Record<string, unknown>
          return filters.every(([key, value]) => row[key] === value) ? [{ ...fixtureMonitor }] : []
        },
      }
      return builder
    },
  }
}

async function renderDetail(search = '', teamId: number | null = 7, authenticated = true) {
  const user = authenticated ? { id: 1, email: 'viewer@example.test', is_super_admin: false } : null
  const context: Record<string, any> = {
    id: '55',
    cookies: authenticated ? { 'auth-token': 'dummy-session' } : {},
    __stxServeSearch: search,
    db: fixtureDatabase(),
    async resolveHealedTeamContext(request: { cookies: { get: (name: string) => string | null } }) {
      expect(request.cookies.get('auth-token')).toBe(authenticated ? 'dummy-session' : null)
      return { user, teamId, activeTeamId: teamId, teams: [], role: authenticated ? 'member' : null }
    },
    async maintenanceIntervalsByMonitor() { return new Map() },
    async suggestServerForMonitor() { return null },
    computeUptime() { return { pct: null, days: [], upChecks: 0, totalChecks: 0 } },
    roundMsForInterval() { return 60000 },
  }

  await extractVariables(script, context, viewPath)
  // This is assigned at the end of the full server block. Require execution
  // to complete, rather than accepting STX's incomplete static fallback.
  expect(context.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2} /)
  expect(context.AUTH_USER ?? null).toEqual(user)

  // Render the actual auth/not-found branches, page header and flash messages.
  // Charts and client scripts are outside this focused session regression.
  const start = source.indexOf('<main class="app-shell">')
  const end = source.indexOf('    <dl class="stat-grid">', start)
  expect(start).toBeGreaterThan(0)
  expect(end).toBeGreaterThan(start)
  const markup = `${source.slice(start, end)}\n@endif\n</main>`
  const html = await processDirectives(markup, context, viewPath, { autoShell: false }, new Set())
  return { context, html }
}

describe('monitor detail preserves the authenticated session (#16)', () => {
  test.each(['', '?range=24h', '?range=7d', '?range=30d'])('renders an authenticated detail for %s', async (search) => {
    const { context, html } = await renderDetail(search)
    expect(context.monitor?.id).toBe(55)
    expect(context.range).toBe(new URLSearchParams(search).get('range') || '24h')
    expect(context.isCustom).toBe(false)
    expect(context.flashServer).toBe(false)
    expect(html).toContain(fixtureMonitor.name)
    expect(html).not.toContain('Sign in required')
    expect(html).not.toContain('Monitor not found')
  })

  test('server attachment feedback does not discard the authenticated user', async () => {
    const { context, html } = await renderDetail('?server=1')
    expect(context.flashServer).toBe(true)
    expect(html).toContain('Server updated.')
    expect(html).toContain(fixtureMonitor.name)
    expect(html).not.toContain('Sign in required')
  })

  test('custom dates and flash parameters continue to work together', async () => {
    const { context, html } = await renderDetail('?server=1&from=2026-09-01&to=2026-09-07')
    expect(context.isCustom).toBe(true)
    expect(context.since).toBe('2026-09-01T00:00:00.000Z')
    expect(context.until).toBe('2026-09-07T23:59:59.999Z')
    expect(context.granularity).toBe('day')
    expect(html).toContain('Server updated.')
    expect(html).not.toContain('Sign in required')
  })

  test('a genuine guest still sees the sign-in prompt, not monitor data', async () => {
    const { context, html } = await renderDetail('', null, false)
    expect(context.monitor).toBeNull()
    expect(html).toContain('Sign in required')
    expect(html).not.toContain(fixtureMonitor.name)
  })

  test('a signed-in member of another team cannot see the monitor', async () => {
    const { context, html } = await renderDetail('', 99)
    expect(context.monitor).toBeNull()
    expect(html).toContain('Monitor not found')
    expect(html).not.toContain('Sign in required')
    expect(html).not.toContain(fixtureMonitor.name)
  })
})
