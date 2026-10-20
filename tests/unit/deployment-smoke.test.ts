import { describe, expect, test } from 'bun:test'
import { assertHealthyDeployment } from '../../scripts/smoke-deployment'

/** A body from a release that carries the schema fact and is fully migrated. */
function healthy(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    app: 'statushq',
    status: 'healthy',
    checks: { database: { ok: true, ms: 1 } },
    migrations: { applied: 257, pending: [] },
    ...overrides,
  })
}

describe('deployment smoke health contract', () => {
  test('accepts StatusHQ with a healthy database and nothing pending', () => {
    expect(() => assertHealthyDeployment(healthy())).not.toThrow()
  })

  test('rejects a response with a failed database check', () => {
    expect(() => assertHealthyDeployment(JSON.stringify({
      app: 'statushq',
      status: 'degraded',
      checks: { database: { ok: false, message: 'no such table: users' } },
      migrations: { applied: 257, pending: [] },
    }))).toThrow('application status degraded')
  })

  test('rejects a healthy-looking response without a database check', () => {
    expect(() => assertHealthyDeployment(JSON.stringify({
      app: 'statushq',
      status: 'healthy',
      checks: {},
      migrations: { applied: 257, pending: [] },
    }))).toThrow('unhealthy database')
  })

  test('rejects invalid JSON and another application', () => {
    expect(() => assertHealthyDeployment('not json')).toThrow('not valid JSON')
    expect(() => assertHealthyDeployment(JSON.stringify({
      app: 'bughq',
      status: 'healthy',
      checks: { database: { ok: true } },
      migrations: { applied: 257, pending: [] },
    }))).toThrow('not statushq')
  })

  /*
   * The point of the whole addition: a reachable database is not a current one.
   * Every case below has `database.ok === true`, which is the state this app
   * served for six days with five queue tables missing.
   */
  test('rejects a reachable database with migrations still pending', () => {
    expect(() => assertHealthyDeployment(healthy({
      migrations: { applied: 255, pending: ['0000000285-create-queue-tables.sql', '0000000286-alter-monitors.sql'] },
    }))).toThrow('2 migration(s) in this release have not been applied')
  })

  test('names the pending files, and caps the list rather than printing 200 of them', () => {
    const pending = Array.from({ length: 9 }, (_, i) => `0000000${i}-a-migration.sql`)
    try {
      assertHealthyDeployment(healthy({ migrations: { applied: 1, pending } }))
      throw new Error('expected a throw')
    }
    catch (error) {
      const message = (error as Error).message
      // Against the generated names rather than retyped literals: the first
      // version of this miscounted the zeros and failed for its own typo.
      expect(message).toContain(pending[0])
      expect(message).toContain(pending[4])
      expect(message).toContain('and 4 more')
      expect(message).not.toContain(pending[8])
    }
  })

  test('rejects a release that cannot read its own migration state', () => {
    expect(() => assertHealthyDeployment(healthy({
      migrations: { applied: 0, pending: [], error: 'no such table: migrations' },
    }))).toThrow('could not read its own migration state')
  })

  /*
   * An older release has no `migrations` key at all. Treated as a failure
   * rather than skipped, because "the field is absent" and "nothing is pending"
   * are indistinguishable to a check that tolerates the first, and the whole
   * reason this exists is that a check which cannot fail reads like one that
   * passed.
   */
  test('rejects a release that carries no migrations fact', () => {
    const { migrations, ...withoutFact } = JSON.parse(healthy()) as Record<string, unknown>
    void migrations
    expect(() => assertHealthyDeployment(JSON.stringify(withoutFact))).toThrow('carries no `migrations` fact')
  })

  test('rejects a malformed pending list instead of reading it as empty', () => {
    expect(() => assertHealthyDeployment(healthy({
      migrations: { applied: 3, pending: 'none' },
    }))).toThrow('malformed migrations.pending')
  })
})
