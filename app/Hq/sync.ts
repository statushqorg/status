import type { HqApp } from './adapter'
import type { NotMonitored, RouteSuite, SuiteChange } from './routeSuite'
import { checkableOrigin, normalizeManifest, reconcile, routeCheckLimit, suiteFromConfig } from './routeSuite'

/**
 * A route sync: an app's manifest in, its one monitor brought in line, and a
 * report of what is checked and what is not.
 *
 * Idempotent. Sending the same manifest twice changes nothing the second
 * time, and the report says so. The only monitor a sync ever touches is the
 * one it created for that app: it is found through `hq_apps.monitor_id` and
 * recognised by the `routeSuite.appId` in its config, so a monitor somebody
 * made by hand, even one at the same address, is never rewritten or removed.
 *
 * No database here either: the monitors and the plan come through
 * `RouteSyncDeps`, which the tests fill from memory.
 */

/** How often an app's routes are asked, unless its plan's floor is higher. */
export const ROUTE_SUITE_INTERVAL_SECONDS = 300

export interface SuiteMonitor {
  id: number
  teamId: number
  name: string
  url: string
  enabled: boolean
  checkIntervalSeconds: number
  /** The `config` column, parsed. */
  config: Record<string, unknown>
}

export interface RouteSyncDeps {
  /** Public web origin, no trailing slash. */
  origin: () => string
  plan: (teamId: number) => Promise<{ plan: string, monitors: number, checkIntervalFloorSeconds: number }>
  countMonitors: (teamId: number) => Promise<number>
  findMonitor: (id: number) => Promise<SuiteMonitor | null>
  createMonitor: (monitor: Omit<SuiteMonitor, 'id'>) => Promise<SuiteMonitor>
  updateMonitor: (id: number, patch: Partial<Omit<SuiteMonitor, 'id' | 'teamId'>>) => Promise<void>
  /** Remember which monitor is the app's, and that it was synced. */
  linkMonitor: (appId: number, monitorId: number | null, syncedAt: string) => Promise<void>
  now?: () => Date
}

export interface RouteSyncReport {
  monitor: { id: number, name: string, dashboardUrl: string, intervalSeconds: number }
  checks: SuiteChange
  notMonitored: NotMonitored[]
}

export type RouteSyncResult
  = | { status: 200, body: RouteSyncReport }
    | { status: 402 | 422, body: { error: string, notMonitored?: NotMonitored[] } }

export function suiteMonitorName(appName: string): string {
  return `${appName} routes`.slice(0, 255)
}

/** The app's own suite monitor, or null when the linked row is not one. */
async function ownMonitor(deps: RouteSyncDeps, app: HqApp): Promise<{ monitor: SuiteMonitor, suite: RouteSuite } | null> {
  if (!app.monitorId)
    return null
  const monitor = await deps.findMonitor(app.monitorId)
  if (!monitor || monitor.teamId !== app.teamId)
    return null
  const suite = suiteFromConfig(monitor.config)
  // A monitor edited into something else, or one the id was reused for, is
  // not this app's any more and is left exactly as it is.
  return suite && suite.appId === app.id ? { monitor, suite } : null
}

export async function syncRoutes(deps: RouteSyncDeps, app: HqApp, raw: unknown): Promise<RouteSyncResult> {
  const body = (raw && typeof raw === 'object' ? raw : {}) as { baseUrl?: unknown, manifest?: unknown }
  const baseUrl = checkableOrigin(body.baseUrl)
  if (!baseUrl)
    return { status: 422, body: { error: 'baseUrl must be the public http or https address the app is served at' } }

  const { plan, monitors: monitorLimit, checkIntervalFloorSeconds } = await deps.plan(app.teamId)
  const manifest = normalizeManifest(body.manifest, routeCheckLimit(plan))
  if ('error' in manifest)
    return { status: 422, body: { error: manifest.error } }

  const existing = await ownMonitor(deps, app)
  const syncedAt = (deps.now?.() ?? new Date()).toISOString()
  const intervalSeconds = Math.max(ROUTE_SUITE_INTERVAL_SECONDS, checkIntervalFloorSeconds)
  const suite: RouteSuite = { appId: app.id, baseUrl, checks: manifest.checks, syncedAt }
  const checks = reconcile(existing?.suite.checks ?? [], manifest.checks)

  let monitor: SuiteMonitor
  if (existing) {
    // Only the suite and what follows from it. A name, an interval or a pause
    // somebody set in the dashboard is theirs, and a sync does not undo it.
    const patch: Partial<Omit<SuiteMonitor, 'id' | 'teamId'>> = {
      url: baseUrl,
      config: { ...existing.monitor.config, routeSuite: suite },
      ...(existing.monitor.checkIntervalSeconds < checkIntervalFloorSeconds ? { checkIntervalSeconds: checkIntervalFloorSeconds } : {}),
    }
    await deps.updateMonitor(existing.monitor.id, patch)
    monitor = { ...existing.monitor, ...patch }
  }
  else {
    // The app's first sync is the one thing here that spends from the plan.
    if (await deps.countMonitors(app.teamId) >= monitorLimit) {
      return {
        status: 402,
        body: {
          error: `This team's ${plan} plan has ${monitorLimit} monitors and all are in use, so ${app.name}'s routes are not being checked. Remove a monitor or upgrade, then sync again.`,
          notMonitored: manifest.checks.map(check => ({ id: check.id, reason: 'the plan has no monitor left for this app' })).concat(manifest.notMonitored),
        },
      }
    }
    monitor = await deps.createMonitor({
      teamId: app.teamId,
      name: suiteMonitorName(app.name),
      url: baseUrl,
      enabled: true,
      checkIntervalSeconds: intervalSeconds,
      config: { routeSuite: suite },
    })
  }

  await deps.linkMonitor(app.id, monitor.id, syncedAt)

  return {
    status: 200,
    body: {
      monitor: { id: monitor.id, name: monitor.name, dashboardUrl: `${deps.origin()}/dashboard/monitors/${monitor.id}`, intervalSeconds: monitor.checkIntervalSeconds },
      checks,
      notMonitored: manifest.notMonitored,
    },
  }
}
