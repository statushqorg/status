/**
 * Server form parsing, the display pills, and the hostname suggestion.
 *
 * The arithmetic here is small and the consequences are not: a threshold that
 * reads blank as zero silently turns every disabled alert back on, and a
 * suggestion that matches too eagerly points a site's telemetry at the wrong
 * machine. Both are the kind of wrong that looks right on the page.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DEFAULT_CPU_THRESHOLD,
  DEFAULT_DISK_THRESHOLD,
  DEFAULT_METRICS_WINDOW_SECONDS,
  DEFAULT_RAM_THRESHOLD,
  MIN_METRICS_WINDOW_SECONDS,
  parseServerForm,
  serverFormErrorLabel,
} from '../../app/lib/serverForm'
import { incidentPillClass, serverStatusPill } from '../../app/lib/display'

const ROOT = join(import.meta.dir, '../..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
/** Source with comments stripped, so a guard cannot be satisfied by prose. */
const code = (p: string) => read(p)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')

describe('parseServerForm', () => {
  test('a name is required and bounded', () => {
    expect(parseServerForm({ name: '' }).error).toBe('name_required')
    expect(parseServerForm({ name: '   ' }).error).toBe('name_required')
    expect(parseServerForm({ name: 'x'.repeat(151) }).error).toBe('name_too_long')
    expect(parseServerForm({ name: 'x'.repeat(150) }).error).toBeNull()
  })

  test('the name is trimmed rather than rejected for whitespace', () => {
    expect(parseServerForm({ name: '  web-01  ' }).values.name).toBe('web-01')
  })

  test('blank thresholds take the defaults', () => {
    const { values } = parseServerForm({ name: 'web-01' })
    expect(values.cpu_threshold).toBe(DEFAULT_CPU_THRESHOLD)
    expect(values.ram_threshold).toBe(DEFAULT_RAM_THRESHOLD)
    expect(values.disk_threshold).toBe(DEFAULT_DISK_THRESHOLD)
    expect(values.metrics_window_seconds).toBe(DEFAULT_METRICS_WINDOW_SECONDS)
  })

  test('zero is off, and is NOT the same as blank', () => {
    // The whole reason thresholdOr exists. `||` here would turn every
    // deliberately disabled threshold back on at 90%.
    const off = parseServerForm({ name: 'web-01', cpu_threshold: '0', ram_threshold: '0', disk_threshold: '0' })
    expect(off.values.cpu_threshold).toBe(0)
    expect(off.values.ram_threshold).toBe(0)
    expect(off.values.disk_threshold).toBe(0)

    const blank = parseServerForm({ name: 'web-01', cpu_threshold: '', ram_threshold: null, disk_threshold: undefined })
    expect(blank.values.cpu_threshold).toBe(DEFAULT_CPU_THRESHOLD)
    expect(blank.values.ram_threshold).toBe(DEFAULT_RAM_THRESHOLD)
    expect(blank.values.disk_threshold).toBe(DEFAULT_DISK_THRESHOLD)
  })

  test('a threshold outside 0-100 falls back rather than storing nonsense', () => {
    expect(parseServerForm({ name: 'x', cpu_threshold: '101' }).values.cpu_threshold).toBe(DEFAULT_CPU_THRESHOLD)
    expect(parseServerForm({ name: 'x', cpu_threshold: '-1' }).values.cpu_threshold).toBe(DEFAULT_CPU_THRESHOLD)
    expect(parseServerForm({ name: 'x', cpu_threshold: 'abc' }).values.cpu_threshold).toBe(DEFAULT_CPU_THRESHOLD)
    expect(parseServerForm({ name: 'x', cpu_threshold: '55.5' }).values.cpu_threshold).toBe(DEFAULT_CPU_THRESHOLD)
  })

  test('a window below the floor is refused, not quietly widened', () => {
    // Clamping would hide that the operator asked for something that alerts
    // between every pair of pushes.
    expect(parseServerForm({ name: 'x', metrics_window_seconds: '10' }).error).toBe('window_invalid')
    expect(parseServerForm({ name: 'x', metrics_window_seconds: '0' }).error).toBe('window_invalid')
    expect(parseServerForm({ name: 'x', metrics_window_seconds: '999999' }).error).toBe('window_invalid')
    expect(parseServerForm({ name: 'x', metrics_window_seconds: String(MIN_METRICS_WINDOW_SECONDS) }).error).toBeNull()
  })

  test('a blank window is the default, not an error', () => {
    expect(parseServerForm({ name: 'x', metrics_window_seconds: '' }).values.metrics_window_seconds).toBe(DEFAULT_METRICS_WINDOW_SECONDS)
  })

  test('status and last_sample_at are not form fields anywhere', () => {
    // An operator cannot type a box into being healthy. The three writers are
    // the ingest, CheckStaleServers and the backfill.
    const src = code('app/lib/serverForm.ts')
    expect(src).not.toContain('status')
    expect(src).not.toContain('last_sample_at')
    const result = parseServerForm({ name: 'x' } as any)
    expect(Object.keys(result.values).sort()).toEqual([
      'cpu_threshold', 'disk_threshold', 'metrics_window_seconds', 'name', 'ram_threshold',
    ])
  })

  test('every error code has a message', () => {
    for (const codeName of ['name_required', 'name_too_long', 'window_invalid', 'server_not_found', 'monitor_not_found']) {
      const label = serverFormErrorLabel(codeName)
      expect(label.length).toBeGreaterThan(10)
      expect(label).not.toBe('Something in that form could not be saved.')
    }
    expect(serverFormErrorLabel('nonsense')).toBe('Something in that form could not be saved.')
  })
})

describe('serverStatusPill', () => {
  test('quiet is amber, never the red reserved for a site being down', () => {
    expect(serverStatusPill('quiet').cls).toBe('pill pill-degraded')
    expect(serverStatusPill('hot').cls).toBe('pill pill-degraded')
    for (const status of ['healthy', 'hot', 'quiet', 'unknown', null, undefined, 'nonsense'])
      expect(serverStatusPill(status).cls).not.toContain('pill-down')
  })

  test('each status has its own label, and an unknown one reads honestly', () => {
    expect(serverStatusPill('healthy')).toEqual({ cls: 'pill pill-up', label: 'Reporting' })
    expect(serverStatusPill('unknown').label).toBe('No samples yet')
    expect(serverStatusPill(undefined).label).toBe('No samples yet')
    expect(serverStatusPill('something-else').label).toBe('No samples yet')
  })
})

describe('incidentPillClass', () => {
  test('a resolved incident is neutral whatever else it says', () => {
    expect(incidentPillClass({ resolved_at: '2026-09-01T00:00:00Z', status: 'investigating' })).toBe('pill pill-unknown')
    expect(incidentPillClass({ status: 'resolved' })).toBe('pill pill-unknown')
  })

  test('monitoring is amber', () => {
    expect(incidentPillClass({ status: 'monitoring' })).toBe('pill pill-degraded')
  })

  test('an outage is red and a soft issue is not', () => {
    // The distinction the whole severity split exists for: "a host crossed
    // 51% against a 50% threshold" must not read like "this site is down".
    const outage = incidentPillClass({ status: 'investigating', impacted_checks: null }, 'uptime')
    expect(outage).toBe('pill pill-down')
    const issue = incidentPillClass({ status: 'investigating', impacted_checks: JSON.stringify([{ type: 'server_metrics' }]) }, 'uptime')
    expect(issue).toBe('pill pill-degraded')
  })
})

describe('the server actions are team-scoped', () => {
  const actions = [
    'CreateServerAction',
    'DashboardCreateServerAction',
    'DashboardUpdateServerAction',
    'DashboardDeleteServerAction',
    'DashboardRotateServerTokenAction',
    'DashboardSaveServerMonitorsAction',
    'DashboardAttachServerAction',
  ]

  test('every one of them resolves the team before touching anything', () => {
    expect(actions.length).toBe(7)
    for (const name of actions) {
      const src = code(`app/Actions/Servers/${name}.ts`)
      expect(`${name}: ${src.includes('requireTeamId(request)')}`).toBe(`${name}: true`)
      // The guard must come before the first write.
      const guard = src.indexOf('requireTeamId')
      const firstWrite = Math.min(
        ...[/\.create\(/, /\.update\(/, /deleteFrom/, /updateTable/, /insertInto/]
          .map((re) => { const i = src.search(re); return i < 0 ? Number.MAX_SAFE_INTEGER : i }),
      )
      expect(`${name}: ${guard < firstWrite}`).toBe(`${name}: true`)
    }
  })

  test('anything naming a server scopes the lookup by team', () => {
    for (const name of ['DashboardUpdateServerAction', 'DashboardDeleteServerAction', 'DashboardRotateServerTokenAction', 'DashboardSaveServerMonitorsAction']) {
      const src = code(`app/Actions/Servers/${name}.ts`)
      expect(`${name}: ${src.includes("where('team_id', authTeamId)")}`).toBe(`${name}: true`)
    }
  })

  test('only the create path mints a credential', () => {
    // A token is issued once, when the box is created, and rotated by the one
    // action whose whole job that is. Nothing else may mint one.
    const minting = ['CreateServerAction', 'DashboardCreateServerAction', 'DashboardRotateServerTokenAction']
    for (const name of actions) {
      const src = code(`app/Actions/Servers/${name}.ts`)
      expect(`${name}: ${src.includes('randomUUIDv7')}`).toBe(`${name}: ${minting.includes(name)}`)
    }
  })

  test('delete is one transaction, and does not fire observers', () => {
    const src = code('app/Actions/Servers/DashboardDeleteServerAction.ts')
    expect(src).toContain('transaction(async (tx)')
    // Query-builder writes only: a model write here would fire
    // incident:updated and page the team about a box they just deleted.
    expect(src).toContain('tx.updateTable(\'monitors\')')
    expect(src).toContain('tx.deleteFrom(\'server_metric_samples\')')
    expect(src).toContain('tx.deleteFrom(\'servers\')')
    expect(src).not.toMatch(/\bIncident\.\w+\(/)
  })

  test('the JSON create refuses reports_metrics rather than ignoring it', () => {
    const src = code('app/Actions/Monitors/CreateMonitorAction.ts')
    expect(src).toContain('422')
    expect(src).toContain('POST /api/servers')
  })
})

describe('the routes are registered where the sweep can see them', () => {
  const routes = read('routes/api.ts')

  test('all seven are at column 0 with single-quoted paths', () => {
    const paths = [
      "route.post('/servers', 'Actions/Servers/CreateServerAction')",
      "route.post('/server-forms/create', 'Actions/Servers/DashboardCreateServerAction')",
      "route.post('/server-forms/{serverId}/update', 'Actions/Servers/DashboardUpdateServerAction')",
      "route.post('/server-forms/{serverId}/delete', 'Actions/Servers/DashboardDeleteServerAction')",
      "route.post('/server-forms/{serverId}/rotate-token', 'Actions/Servers/DashboardRotateServerTokenAction')",
      "route.post('/server-forms/{serverId}/monitors', 'Actions/Servers/DashboardSaveServerMonitorsAction')",
      "route.post('/server-forms/monitors/{monitorId}/server', 'Actions/Servers/DashboardAttachServerAction')",
    ]
    for (const line of paths)
      expect(routes).toContain(`\n${line}`)
  })
})

describe('the views keep the credential off the page', () => {
  test('the server pages bind raw rows only under a __ prefix', () => {
    for (const p of ['resources/views/dashboard/servers/index.stx', 'resources/views/dashboard/servers/[id].stx']) {
      const src = read(p)
      // Any binding of a raw servers row must be __-prefixed; the bridge
      // skips those, and a servers row carries metrics_token.
      expect(`${p}: ${/const (?!__)\w+ = await .*selectFrom\('servers'\)[\s\S]{0,200}selectAll\(\)/.test(src)}`).toBe(`${p}: false`)
    }
  })

  test('the token reaches the page through exactly one binding', () => {
    const src = read('resources/views/dashboard/servers/[id].stx')
    const hits = [...src.matchAll(/metrics_token/g)]
    // Once in the security note, and only inside __agentInstall otherwise.
    for (const m of hits) {
      const line = src.slice(src.lastIndexOf('\n', m.index!) + 1, src.indexOf('\n', m.index!)).trim()
      // Either the one read off the raw row, or prose in the security note.
      const ok = line.includes('__serverRow.metrics_token') || line.startsWith('//') || line.startsWith('*') || line.includes('metrics_token.')
      expect(`${line.slice(0, 70)} -> ${ok}`).toContain('-> true')
    }
  })

  test('the monitor page no longer carries the agent card', () => {
    const src = read('resources/views/dashboard/monitors/[id].stx')
    expect(src).not.toContain('__agentInstall')
    expect(src).not.toContain('aria-label="Agent setup"')
    expect(src).not.toContain('hostChart')
  })
})
