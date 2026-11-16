import type { ConnectCodeStore, ConnectGrant, HqServiceAdapter, ReadPrincipal } from '@stacksjs/hq/service'
import { hashKey, looksLikeIngestKey, looksLikeReadKey, newIngestKey, newReadKey, sameKey } from './keys'

/**
 * StatusHQ's side of the HQ connect contract (`@stacksjs/hq/service`).
 *
 * `buddy hq:connect statushq` asks for a code, a signed-in person approves it
 * on /cli/connect, and the CLI collects the app's two keys. The package owns
 * the codes and the wire format. This file owns what they mean here.
 *
 * ## What connecting an app makes
 *
 * An app: a name under the approver's team, with an ingest key and a read key
 * (`hq_apps`). Nothing is monitored yet. The app's deploy then sends its
 * routes with the ingest key (POST /api/v1/routes/sync), and that is what
 * creates the app's one monitor, so a connect on its own never spends a
 * monitor from the plan.
 *
 * Connecting the same name again from the same team answers the same app and
 * the keys it already has. A second machine, or a second run, must not rotate
 * the keys out from under the deploy that is using them.
 *
 * Nothing in this file touches the database. It is handed an `AppStore`,
 * which is what lets the package's contract suite run against the code the
 * routes use (tests/unit/hq-connect.test.ts).
 */

export interface HqApp {
  id: number
  teamId: number
  name: string
  ingestKey: string
  readKey: string
  /** The monitor its routes are checked by, once they have been sent. */
  monitorId: number | null
}

export interface AppStore {
  /** The team's app of this name, compared case-insensitively. */
  findByTeamAndName: (teamId: number, name: string) => Promise<HqApp | null>
  create: (app: { teamId: number, name: string, ingestKey: string, readKey: string }) => Promise<HqApp>
  findByIngestKeyHash: (hash: string) => Promise<HqApp | null>
  findByReadKeyHash: (hash: string) => Promise<HqApp | null>
}

/** The signed-in person approving a connect, and the team they are acting for. */
export interface HqUser {
  id: number | string
  teamId: number
}

/** The one meter this service reports: monitors used against the plan. */
export const MONITORS_METER = 'monitors'

export interface StatushqAdapterDeps {
  apps: AppStore
  codes: ConnectCodeStore
  /** Public web origin, no trailing slash. */
  origin: () => string
  /** Monitors the team has, and how many its plan allows (null for no limit). */
  monitors: (teamId: number) => Promise<{ used: number, limit: number | null }>
}

/** The app an ingest key belongs to, or null. */
export async function appForIngestKey(apps: AppStore, presented: unknown): Promise<HqApp | null> {
  // Shape first: a read key, a session token or anything else never reaches
  // the lookup, so none of them can be tried as an ingest key.
  if (!looksLikeIngestKey(presented))
    return null
  const app = await apps.findByIngestKeyHash(hashKey(presented))
  return app && sameKey(presented, app.ingestKey) ? app : null
}

export function createStatushqAdapter(deps: StatushqAdapterDeps): HqServiceAdapter<HqUser> {
  const { apps } = deps

  async function provision(user: HqUser, { app }: { app: string }): Promise<ConnectGrant> {
    const teamId = Number(user.teamId)
    if (!Number.isInteger(teamId) || teamId <= 0)
      throw new TypeError('A connect can only be approved by somebody signed in to a team.')

    const found = await apps.findByTeamAndName(teamId, app)
      ?? await apps.create({ teamId, name: app, ingestKey: newIngestKey(), readKey: newReadKey() })

    return {
      project: { id: String(found.id), name: found.name },
      ingestKey: found.ingestKey,
      readKey: found.readKey,
      dashboardUrl: found.monitorId
        ? `${deps.origin()}/dashboard/monitors/${found.monitorId}`
        : `${deps.origin()}/dashboard/monitors`,
    }
  }

  async function authenticateReadKey(presented: string): Promise<ReadPrincipal | null> {
    if (!looksLikeReadKey(presented))
      return null
    const app = await apps.findByReadKeyHash(hashKey(presented))
    if (!app || !sameKey(presented, app.readKey))
      return null
    // A plan belongs to the team, so the team is who usage is counted for.
    return { owner: String(app.teamId), project: String(app.id) }
  }

  return {
    service: 'statushq',
    approveUrl: code => `${deps.origin()}/cli/connect?code=${encodeURIComponent(code)}`,
    upgradeUrl: () => `${deps.origin()}/dashboard/settings/billing`,
    codes: deps.codes,
    provision,
    authenticateReadKey,
    async usage(principal) {
      const teamId = Number(principal.owner)
      if (!Number.isInteger(teamId) || teamId <= 0)
        return [{ meter: MONITORS_METER, used: 0, limit: null, policy: 'hard-send' }]
      const { used, limit } = await deps.monitors(teamId)
      return [{ meter: MONITORS_METER, used, limit, policy: 'hard-send' }]
    },
  }
}
