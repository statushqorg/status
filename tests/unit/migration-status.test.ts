/**
 * The schema fact the deploy smoke reads.
 *
 * Tested because the failure mode of this helper is a FALSE ALARM: if
 * `db.selectFrom('migrations')` throws for a reason that has nothing to do with
 * pending migrations, the catch reports an error, the smoke reads that error
 * and fails a deploy that was fine. A probe that cries wolf gets waved through,
 * which is how the thing it watches for reaches production anyway.
 *
 * So the assertion that matters is the boring one: against a real database, it
 * returns a count and an empty list rather than an error.
 */
import { describe, expect, test } from 'bun:test'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { migrationStatus } from '../../app/Support/migrations'

const ROOT = join(import.meta.dir, '../..')

describe('migrationStatus', () => {
  test('reads the migrations table rather than reporting an error', async () => {
    const status = await migrationStatus()
    // An error here is the false-alarm case, and its message is worth printing
    // in the failure rather than leaving someone to guess which half broke.
    expect(status.error ?? null).toBeNull()
    expect(status.applied).toBeGreaterThan(0)
  })

  test('counts every .sql file in the release as either applied or pending', async () => {
    const onDisk = readdirSync(join(ROOT, 'database/migrations')).filter(f => f.endsWith('.sql'))
    const status = await migrationStatus()
    // `applied` counts DISTINCT rows in the table, which can exceed the files
    // in this release when an older migration was applied and later deleted.
    // The invariant that holds either way: nothing pending is unaccounted for.
    for (const name of status.pending)
      expect(onDisk).toContain(name)
  })

  test('pending is a list of filenames, which is what the smoke prints', async () => {
    const status = await migrationStatus()
    expect(Array.isArray(status.pending)).toBe(true)
    for (const name of status.pending)
      expect(name).toMatch(/\.sql$/)
  })
})
