/**
 * An app's routes, checked as one monitor.
 *
 * `buddy hq:sync` sends StatusHQ a manifest: every route of a connected app
 * that can be asked without changing anything, and what each must answer
 * (the rules are the framework's, in `@stacksjs/hq/route-manifest`). This file
 * is everything about that manifest that needs no database and no network:
 * what is accepted from the wire, how one sync differs from the last, how a
 * check is requested, and what a round of answers means for the monitor.
 *
 * ## Why one monitor and not one a route
 *
 * A plan counts monitors (five on the free plan), and an app has tens or
 * hundreds of routes. One monitor a route would spend a plan on a single app
 * and page once a route when a deploy goes wrong. So an app is one monitor of
 * type `health` whose config carries its routes: one row in the dashboard, one
 * incident when routes fail, and a result that names which.
 *
 * It rides on the `health` type on purpose. `monitors.type` is a CHECK
 * constraint in SQLite, so a new type would mean rebuilding the table every
 * install has, and an app's routes answering as they should is what "health"
 * means. RunHealthCheck hands a monitor with a `routeSuite` in its config
 * here and does nothing else with it.
 *
 * ## What a check may do
 *
 * Nothing that changes the app it asks. A check is a GET, or a write that the
 * app must refuse: sent without credentials to a route behind auth, or with an
 * empty body to a route that validates one. `normalizeManifest` enforces that
 * shape whatever the sender says, because the key that authorises a sync is a
 * secret in a deploy pipeline, not a promise about what it will send.
 */

export type RouteCheckKind = 'page' | 'public' | 'guard' | 'validation'

export interface RouteCheck {
  /** `GET /api/posts`: what a check is matched by from one sync to the next. */
  id: string
  method: string
  path: string
  kind: RouteCheckKind
  /** Statuses accepted: a class (`2xx`) or one code (`401`). */
  expect: string[]
  /** Send `{}` as JSON. Only on a check that must be refused. */
  send?: 'empty-json'
}

export interface RouteSuite {
  /** The app as it was connected: the `hq_apps` row this suite belongs to. */
  appId: number
  baseUrl: string
  checks: RouteCheck[]
  syncedAt: string
}

export interface NotMonitored {
  id: string
  reason: string
}

const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
const KINDS = new Set<RouteCheckKind>(['page', 'public', 'guard', 'validation'])
const STATUS = /^[1-5](?:xx|\d\d)$/
const MAX_PATH = 512
/** Hard ceiling on what one sync may carry, whatever the plan. */
export const MAX_MANIFEST_CHECKS = 2000

/** Route checks one app may run, by plan. A plan not named here gets the free allowance. */
export const ROUTE_CHECK_LIMITS: Record<string, number> = {
  'free': 50,
  'pro': 500,
  'self-hosted': 1000,
}

export function routeCheckLimit(plan: string): number {
  return ROUTE_CHECK_LIMITS[plan] ?? ROUTE_CHECK_LIMITS.free!
}

/** The web origin of an address, or null when it is not one a check may be sent to. */
export function checkableOrigin(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048)
    return null
  let url: URL
  try {
    url = new URL(value)
  }
  catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    return null
  if (url.username || url.password)
    return null
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  // A monitor asks from this server. An address that names this server, or a
  // network only it can see, would turn a sync into a way to probe inside.
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal'))
    return null
  if (/^(?:127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(host) || host === '::1' || /^f[cd][0-9a-f]{2}:/.test(host) || host.startsWith('fe80:'))
    return null
  return url.origin
}

/** Whether a status is one a check accepts. */
export function statusMatches(expect: readonly string[], status: number): boolean {
  const code = String(status)
  return expect.some(value => (value.endsWith('xx') ? value[0] === code[0] : value === code))
}

function accepts2xx(expect: readonly string[]): boolean {
  return expect.some(value => value[0] === '2')
}

/**
 * One check off the wire, or the reason it is refused.
 *
 * The rule that matters is the last: a write is only kept when it cannot
 * succeed. A manifest that asks for `POST /api/things` and accepts a 2xx is
 * asking StatusHQ to create things every few minutes, and is turned away here
 * whatever built it.
 */
export function normalizeCheck(raw: unknown): { check: RouteCheck } | { id: string, reason: string } {
  const entry = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const method = String(entry.method ?? '').toUpperCase()
  const path = typeof entry.path === 'string' ? entry.path : ''
  const id = `${method || '?'} ${path || '?'}`

  if (!METHODS.has(method))
    return { id, reason: 'not a method a check can use' }
  if (!path.startsWith('/') || path.startsWith('//') || path.length > MAX_PATH || /[\s{}*\\]/.test(path) || path.includes('/../') || path.endsWith('/..'))
    return { id, reason: 'not a plain path' }

  const kind = entry.kind as RouteCheckKind
  if (!KINDS.has(kind))
    return { id, reason: 'not a kind of check this understands' }

  const expect = [...new Set((Array.isArray(entry.expect) ? entry.expect : []).map(value => String(value).toLowerCase()).filter(value => STATUS.test(value)))]
  if (expect.length === 0)
    return { id, reason: 'says nothing about what to expect' }

  const send = entry.send === 'empty-json' ? 'empty-json' as const : undefined
  if (method === 'GET') {
    if (send)
      return { id, reason: 'a GET carries no body' }
    return { check: { id, method, path, kind, expect } }
  }

  if (kind !== 'guard' && kind !== 'validation')
    return { id, reason: 'a write is only checked where the app must refuse it' }
  if (accepts2xx(expect))
    return { id, reason: 'a write that may succeed would change the app it checks' }
  return { check: { id, method, path, kind, expect, ...(send ? { send } : {}) } }
}

export interface NormalizedManifest {
  checks: RouteCheck[]
  notMonitored: NotMonitored[]
}

/**
 * A manifest off the wire as the checks to run, and what is not run and why.
 * `limit` is the plan's allowance; what is over it is left out last, so the
 * same routes are kept from one sync to the next.
 */
export function normalizeManifest(raw: unknown, limit: number): NormalizedManifest | { error: string } {
  const manifest = (raw && typeof raw === 'object' ? raw : {}) as { checks?: unknown }
  if (!Array.isArray(manifest.checks))
    return { error: 'manifest.checks must be a list' }
  if (manifest.checks.length > MAX_MANIFEST_CHECKS)
    return { error: `a sync carries at most ${MAX_MANIFEST_CHECKS} checks` }

  const kept = new Map<string, RouteCheck>()
  const notMonitored: NotMonitored[] = []
  for (const entry of manifest.checks) {
    const outcome = normalizeCheck(entry)
    if ('reason' in outcome)
      notMonitored.push(outcome)
    else
      kept.set(outcome.check.id, outcome.check)
  }

  // Pages and public routes first: when an allowance cuts the list, what a
  // visitor sees is what stays watched.
  const rank: Record<RouteCheckKind, number> = { page: 0, public: 1, guard: 2, validation: 3 }
  const ordered = [...kept.values()].sort((a, b) => rank[a.kind] - rank[b.kind] || (a.path < b.path ? -1 : a.path > b.path ? 1 : a.method < b.method ? -1 : 1))
  const checks = ordered.slice(0, Math.max(0, limit))
  for (const over of ordered.slice(checks.length))
    notMonitored.push({ id: over.id, reason: `over this plan's ${limit} route checks for an app` })

  return { checks, notMonitored }
}

export interface SuiteChange {
  total: number
  added: number
  changed: number
  removed: number
  unchanged: number
}

/** How one sync differs from the one before it. */
export function reconcile(before: readonly RouteCheck[], after: readonly RouteCheck[]): SuiteChange {
  const previous = new Map(before.map(check => [check.id, JSON.stringify(check)]))
  let added = 0
  let changed = 0
  let unchanged = 0
  for (const check of after) {
    const was = previous.get(check.id)
    if (was === undefined)
      added++
    else if (was === JSON.stringify(check))
      unchanged++
    else
      changed++
    previous.delete(check.id)
  }
  return { total: after.length, added, changed, removed: previous.size, unchanged }
}

/** A suite read back out of a monitor's config, or null where it has none. */
export function suiteFromConfig(config: Record<string, unknown>): RouteSuite | null {
  const suite = config.routeSuite as Partial<RouteSuite> | undefined
  if (!suite || typeof suite !== 'object' || !Array.isArray(suite.checks) || typeof suite.baseUrl !== 'string')
    return null
  return { appId: Number(suite.appId), baseUrl: suite.baseUrl, checks: suite.checks as RouteCheck[], syncedAt: String(suite.syncedAt ?? '') }
}

export interface RouteResult {
  id: string
  ok: boolean
  /** The status answered, or null when nothing answered. */
  status: number | null
  ms: number
  /** Why it failed, in words: `answered 500, expected 2xx or 3xx`. */
  why?: string
}

export interface SuiteRunOptions {
  fetch?: (url: string, init: RequestInit) => Promise<Response>
  /** Requests in flight at once. */
  concurrency?: number
  timeoutMs?: number
  now?: () => number
}

/** Ask one check, and say whether the answer is one it accepts. */
export async function runCheck(baseUrl: string, check: RouteCheck, options: SuiteRunOptions = {}): Promise<RouteResult> {
  const request = options.fetch ?? ((url: string, init: RequestInit) => fetch(url, init))
  const now = options.now ?? (() => performance.now())
  const started = now()
  try {
    const response = await request(`${baseUrl}${check.path}`, {
      method: check.method,
      // Never followed: a redirect is an answer, and following one could leave
      // the app this suite was given.
      redirect: 'manual',
      headers: {
        'Accept': check.kind === 'page' ? 'text/html,*/*;q=0.8' : 'application/json,*/*;q=0.8',
        'User-Agent': 'StatusHQ-RouteCheck/1.0 (+https://statushq.org)',
        ...(check.send ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(check.send ? { body: '{}' } : {}),
      signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
    })
    // Read and dropped, so the connection is given back.
    await response.arrayBuffer().catch(() => {})
    const ms = Math.round(now() - started)
    if (statusMatches(check.expect, response.status))
      return { id: check.id, ok: true, status: response.status, ms }
    return { id: check.id, ok: false, status: response.status, ms, why: `answered ${response.status}, expected ${check.expect.join(' or ')}` }
  }
  catch (error) {
    const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
    return { id: check.id, ok: false, status: null, ms: Math.round(now() - started), why: timedOut ? 'did not answer in time' : 'could not be reached' }
  }
}

/** Ask every check of a suite, a few at a time. */
export async function runSuite(suite: Pick<RouteSuite, 'baseUrl' | 'checks'>, options: SuiteRunOptions = {}): Promise<RouteResult[]> {
  const results: RouteResult[] = Array.from({ length: suite.checks.length })
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < suite.checks.length) {
      const index = next++
      results[index] = await runCheck(suite.baseUrl, suite.checks[index]!, options)
    }
  }
  await Promise.all(Array.from({ length: Math.min(options.concurrency ?? 6, Math.max(1, suite.checks.length)) }, worker))
  return results
}

export interface SuiteVerdict {
  status: 'up' | 'degraded' | 'down'
  message: string
  failing: RouteResult[]
  slowestMs: number
}

/**
 * What a round of answers means for the monitor.
 *
 * Every route answering as it should is up. Some failing is degraded: the app
 * is serving, and the message names what is not. Half or more failing, or
 * nothing reachable at all, is down, because at that point it is the app that
 * is broken and not a route.
 */
export function evaluateSuite(results: readonly RouteResult[]): SuiteVerdict {
  const failing = results.filter(result => !result.ok)
  const slowestMs = results.reduce((max, result) => Math.max(max, result.ms), 0)
  if (results.length === 0)
    return { status: 'up', message: 'No routes to check yet', failing, slowestMs }
  if (failing.length === 0)
    return { status: 'up', message: `All ${results.length} routes answered as expected`, failing, slowestMs }

  const named = failing.slice(0, 5).map(result => `${result.id} ${result.why ?? 'failed'}`).join('; ')
  const more = failing.length > 5 ? `; and ${failing.length - 5} more` : ''
  const unreachable = failing.every(result => result.status === null)
  const status = failing.length === results.length && unreachable ? 'down' : failing.length * 2 >= results.length ? 'down' : 'degraded'
  return { status, message: `${failing.length} of ${results.length} routes failing: ${named}${more}`, failing, slowestMs }
}
