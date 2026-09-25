import { describe, expect, test } from 'bun:test'
import { assertHealthyDeployment } from '../../scripts/smoke-deployment'

describe('deployment smoke health contract', () => {
  test('accepts StatusHQ with a healthy database', () => {
    expect(() => assertHealthyDeployment(JSON.stringify({
      app: 'statushq',
      status: 'healthy',
      checks: { database: { ok: true, ms: 1 } },
    }))).not.toThrow()
  })

  test('rejects a response with a failed database check', () => {
    expect(() => assertHealthyDeployment(JSON.stringify({
      app: 'statushq',
      status: 'degraded',
      checks: { database: { ok: false, message: 'no such table: users' } },
    }))).toThrow('application status degraded')
  })

  test('rejects a healthy-looking response without a database check', () => {
    expect(() => assertHealthyDeployment(JSON.stringify({
      app: 'statushq',
      status: 'healthy',
      checks: {},
    }))).toThrow('unhealthy database')
  })

  test('rejects invalid JSON and another application', () => {
    expect(() => assertHealthyDeployment('not json')).toThrow('not valid JSON')
    expect(() => assertHealthyDeployment(JSON.stringify({
      app: 'bughq',
      status: 'healthy',
      checks: { database: { ok: true } },
    }))).toThrow('not statushq')
  })
})
