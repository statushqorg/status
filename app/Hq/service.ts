import type { AppStore, HqApp } from './adapter'
import type { RouteSyncDeps, SuiteMonitor } from './sync'
import process from 'node:process'
import { db } from '@stacksjs/database'
import { createHqService, sqlConnectCodeStore } from '@stacksjs/hq/service'
import { planForTeam } from '../../config/plans'
import { parseMonitorConfig } from '../lib/monitorConfig'
import Monitor from '../Models/Monitor'
import { createStatushqAdapter } from './adapter'
import { hashKey as hashOf } from './keys'

/**
 * The HQ service wired to this app's database. routes/api.ts mounts its
 * endpoints, the approve page (resources/views/cli/connect.stx) calls
 * `describeConnect`, and the route sync writes through `routeSyncDeps`. The
 * tables behind it are created by migration 0000000287.
 */

const DIALECT = (process.env.DB_CONNECTION || 'sqlite') === 'postgres' ? 'postgres' as const : (process.env.DB_CONNECTION === 'mysql' ? 'mysql' as const : 'sqlite' as const)

type Row = Record<string, unknown>

function toApp(row: Row | null | undefined): HqApp | null {
  if (!row)
    return null
  return {
    id: Number(row.id),
    teamId: Number(row.team_id),
    name: String(row.name ?? ''),
    ingestKey: String(row.ingest_key ?? ''),
    readKey: String(row.read_key ?? ''),
    monitorId: row.monitor_id == null ? null : Number(row.monitor_id),
  }
}

const now = (): string => new Date().toISOString().slice(0, 19).replace('T', ' ')

export const sqlAppStore: AppStore = {
  async findByTeamAndName(teamId, name) {
    // Names are kept as typed and matched without case, so `Votescape` and
    // `votescape` connected from two machines are one app.
    const rows = await db.selectFrom('hq_apps').where('team_id', '=', teamId).selectAll().execute() as Row[]
    const wanted = name.toLowerCase()
    return toApp(rows.find(row => String(row.name ?? '').toLowerCase() === wanted))
  },
  async create(app) {
    await db.insertInto('hq_apps').values({
      team_id: app.teamId,
      name: app.name,
      ingest_key: app.ingestKey,
      ingest_key_hash: hashOf(app.ingestKey),
      read_key: app.readKey,
      read_key_hash: hashOf(app.readKey),
      created_at: now(),
      updated_at: now(),
    }).execute()
    const created = toApp(await db.selectFrom('hq_apps').where('ingest_key_hash', '=', hashOf(app.ingestKey)).selectAll().executeTakeFirst() as Row | undefined)
    if (!created)
      throw new Error('The app was not saved.')
    return created
  },
  async findByIngestKeyHash(hash) {
    return toApp(await db.selectFrom('hq_apps').where('ingest_key_hash', '=', hash).selectAll().executeTakeFirst() as Row | undefined)
  },
  async findByReadKeyHash(hash) {
    return toApp(await db.selectFrom('hq_apps').where('read_key_hash', '=', hash).selectAll().executeTakeFirst() as Row | undefined)
  },
}

/** The public web origin with its scheme, no trailing slash. */
export function appOrigin(): string {
  const raw = String(process.env.APP_URL || 'statushq.org').replace(/\/+$/, '')
  return /^https?:\/\//.test(raw) ? raw : `https://${raw}`
}

async function countMonitors(teamId: number): Promise<number> {
  return (await Monitor.where('team_id', teamId).get()).length
}

function toSuiteMonitor(row: Row): SuiteMonitor {
  return {
    id: Number(row.id),
    teamId: Number(row.team_id),
    name: String(row.name ?? ''),
    url: String(row.url ?? ''),
    enabled: row.enabled === true || row.enabled === 1 || row.enabled === '1',
    checkIntervalSeconds: Number(row.check_interval_seconds ?? 0),
    config: parseMonitorConfig(typeof row.config === 'string' ? row.config : null),
  }
}

export const routeSyncDeps: RouteSyncDeps = {
  origin: appOrigin,
  async plan(teamId) {
    const { plan, limits } = await planForTeam(teamId)
    return { plan, monitors: limits.monitors, checkIntervalFloorSeconds: limits.checkIntervalFloorSeconds }
  },
  countMonitors,
  async findMonitor(id) {
    const row = await db.selectFrom('monitors').where('id', '=', id).selectAll().executeTakeFirst() as Row | undefined
    return row ? toSuiteMonitor(row) : null
  },
  async createMonitor(monitor) {
    // Through the model, as the dashboard and the API create one, so its
    // defaults, its uuid and its events are the same.
    const created = await Monitor.create({
      teamId: monitor.teamId,
      name: monitor.name,
      url: monitor.url,
      type: 'health',
      enabled: monitor.enabled,
      checkIntervalSeconds: monitor.checkIntervalSeconds,
      config: JSON.stringify(monitor.config),
      status: 'unknown',
    })
    return { ...monitor, id: Number(created.id) }
  },
  async updateMonitor(id, patch) {
    const values: Row = { updated_at: now() }
    if (patch.url !== undefined)
      values.url = patch.url
    if (patch.name !== undefined)
      values.name = patch.name
    if (patch.checkIntervalSeconds !== undefined)
      values.check_interval_seconds = patch.checkIntervalSeconds
    if (patch.config !== undefined)
      values.config = JSON.stringify(patch.config)
    await db.updateTable('monitors').set(values).where('id', '=', id).execute()
  },
  async linkMonitor(appId, monitorId, syncedAt) {
    await db.updateTable('hq_apps').set({ monitor_id: monitorId, routes_synced_at: syncedAt, updated_at: now() }).where('id', '=', appId).execute()
  },
}

export const statushqAdapter = createStatushqAdapter({
  apps: sqlAppStore,
  codes: sqlConnectCodeStore(db, { dialect: DIALECT }),
  origin: appOrigin,
  async monitors(teamId) {
    const { limits } = await planForTeam(teamId)
    return { used: await countMonitors(teamId), limit: Number.isFinite(limits.monitors) ? limits.monitors : null }
  },
})

export const hq = createHqService(statushqAdapter)
