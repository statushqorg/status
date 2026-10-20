import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { db } from '@stacksjs/database'

/**
 * What the deployed release knows about its own schema.
 *
 * `pending` is the gap between the .sql files in this release and the rows in
 * the `migrations` table of the database it is actually talking to.
 */
export interface MigrationStatus {
  applied: number
  pending: string[]
  /** Set only when the gap could not be measured, which is itself a finding. */
  error?: string
}

const MIGRATIONS_DIR = resolve(import.meta.dir, '../../database/migrations')

/**
 * Why this exists at all.
 *
 * Migrations here run from `preStart` on the box (config/cloud.ts), which is
 * server side, so their output never reaches the CI log and their exit code
 * never reaches the deploy. That is not hypothetical: `buddy migrate` exited 1
 * on every deploy for six days while deploy-prod stayed green, five queue
 * tables stayed missing, and the worker logged `no such table:
 * queue_circuit_state` twice a second for 192,000 events before anyone noticed.
 *
 * The existing database probe could not have caught it and still cannot. It
 * runs `SELECT 1`, which succeeds against a database that is reachable and
 * half-migrated, which is exactly the state that outage was. Reachable is not
 * the same as current, and only the second one means the release can run.
 *
 * Reported as a FACT rather than as a health check, deliberately. Folding it
 * into `checks` would turn the endpoint 503 the moment a migration is pending,
 * and an uptime monitor would read that as the site being down when it may
 * still be serving every page correctly. The deploy smoke is the right place
 * to decide that a pending migration means a failed deploy; a monitor's job is
 * to say whether the site is up. Same body, two readers, different thresholds.
 */
export async function migrationStatus(): Promise<MigrationStatus> {
  let onDisk: string[]
  try {
    onDisk = readdirSync(MIGRATIONS_DIR).filter(name => name.endsWith('.sql')).sort()
  }
  catch (err) {
    return { applied: 0, pending: [], error: `could not read ${MIGRATIONS_DIR}: ${err instanceof Error ? err.message : String(err)}` }
  }

  try {
    const rows = await db.selectFrom('migrations').select(['migration']).execute() as unknown as { migration: string }[]
    const applied = new Set(rows.map(row => String(row.migration)))
    return { applied: applied.size, pending: onDisk.filter(name => !applied.has(name)) }
  }
  catch (err) {
    // A missing `migrations` table means nothing has ever been applied here,
    // which is the most severe version of the thing this reports rather than a
    // reason to stay quiet. Never rethrow: the health endpoint answering 500
    // would take out the monitor along with the signal.
    return {
      applied: 0,
      pending: onDisk,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
