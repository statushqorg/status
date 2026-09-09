/**
 * Guessing which box a monitor probably runs on.
 *
 * Suggestion only, never membership. Nothing here attaches anything: the
 * monitor page renders the guess as a pre-selected option in a dialog the
 * operator still has to submit, so a wrong guess costs a click rather than
 * pointing a site's telemetry at the wrong machine.
 *
 * String matching only, and deliberately no DNS. This runs inside a page
 * render, and a page that blocks on resolution is a page that hangs when a
 * resolver does.
 */

import { db } from '@stacksjs/database'
import { normalizeHost } from './agentHosts'
import { siteHost } from './display'

/** How far back a reported host still counts as one this box is known by. */
const KNOWN_HOST_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

/**
 * `default` is what an agent sends when its installer predates the host
 * field. It identifies nothing, and matching on it would make every such box
 * a candidate for every monitor.
 */
const ANONYMOUS_HOST = 'default'

/** The first dot-separated label: `web-01` out of `web-01.example.com`. */
function firstLabel(host: string): string {
  return host.split('.')[0] ?? ''
}

/**
 * Equal outright, or equal on the first label.
 *
 * The second case is the one that earns its keep: an agent reports the box's
 * short hostname (`web-01`) while the monitor watches a fully qualified URL
 * (`https://web-01.example.com`), and only the label they share connects them.
 */
function match(a: string, b: string): boolean {
  if (!a || !b)
    return false
  if (a === b)
    return true
  const left = firstLabel(a)
  const right = firstLabel(b)
  return left !== '' && left === right
}

/**
 * Every host each server's agent has reported in the last seven days, plus
 * nothing else. The name is added by the caller, because a name is a claim
 * about a box and a sample is evidence.
 */
export async function knownHostsForServers(serverIds: number[]): Promise<Map<number, Set<string>>> {
  const out = new Map<number, Set<string>>()
  if (!serverIds.length)
    return out

  const since = new Date(Date.now() - KNOWN_HOST_WINDOW_MS).toISOString()
  const rows = await db.selectFrom('server_metric_samples')
    .where('server_id', 'in', serverIds)
    .where('sampled_at', '>=', since)
    .select(['server_id', 'host'])
    .distinct()
    .execute()
    .catch(() => [] as Array<{ server_id: unknown, host: unknown }>)

  for (const row of rows) {
    const host = normalizeHost(row.host)
    if (!host || host === ANONYMOUS_HOST)
      continue
    const id = Number(row.server_id)
    if (!Number.isFinite(id))
      continue
    const set = out.get(id) ?? new Set<string>()
    set.add(host)
    out.set(id, set)
  }

  return out
}

/**
 * The first server whose known hosts match the monitor's URL host, or null.
 *
 * "First" is by the order the caller passes, which every call site sorts by
 * name, so the suggestion is stable across renders rather than depending on
 * which box happened to push most recently.
 */
export async function suggestServerForMonitor(
  monitor: { url: string },
  servers: Array<{ id: number, name: string }>,
): Promise<{ id: number, name: string, host: string } | null> {
  if (!servers.length)
    return null

  const host = normalizeHost(siteHost(monitor.url))
  if (!host || host === ANONYMOUS_HOST)
    return null

  const known = await knownHostsForServers(servers.map(s => Number(s.id)))

  for (const server of servers) {
    const candidates = new Set<string>(known.get(Number(server.id)) ?? [])
    // The name is a candidate too. For the boxes whose agents predate the
    // host field it is the ONLY candidate, and the backfill set it from the
    // monitor's own name, so it is the thing most likely to match.
    const named = normalizeHost(server.name)
    if (named && named !== ANONYMOUS_HOST)
      candidates.add(named)

    for (const candidate of candidates) {
      if (match(candidate, host))
        return { id: Number(server.id), name: String(server.name), host: candidate }
    }
  }

  return null
}
