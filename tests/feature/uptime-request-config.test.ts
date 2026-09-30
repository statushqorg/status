import type { Server } from 'bun'
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test'
import RunUptimeCheck from '../../app/Jobs/RunUptimeCheck'
import Assertion from '../../app/Models/Assertion'
import CheckResult from '../../app/Models/CheckResult'
import Monitor from '../../app/Models/Monitor'

// See monitor-crud.test.ts's TEAM_ID comment — each file isolates fixtures.
const TEAM_ID = 90022

/**
 * An uptime monitor that POSTs JSON and whose healthy answer is a 404: the
 * shape of a license API asked about a key that does not exist. Before
 * config.method/body/expectedStatus it could only GET, and a 404 was down.
 */
describe('uptime monitors that send a request of their own', () => {
  let server: Server
  const seen: Array<{ method: string, contentType: string | null, body: string }> = []
  let answer = { status: 404, body: '{"valid":false}' }

  beforeAll(() => {
    server = Bun.serve({
      port: 0,
      async fetch(req) {
        seen.push({ method: req.method, contentType: req.headers.get('content-type'), body: await req.text() })
        return new Response(answer.body, { status: answer.status, headers: { 'content-type': 'application/json' } })
      },
    })
  })
  afterAll(() => server.stop(true))

  async function cleanup(): Promise<void> {
    for (const monitor of await Monitor.where('team_id', TEAM_ID).get()) {
      for (const a of await Assertion.where('monitor_id', monitor.id).get())
        await a.delete()
      for (const r of await CheckResult.where('monitor_id', monitor.id).get())
        await r.delete()
      await monitor.delete()
    }
    seen.length = 0
  }
  beforeAll(cleanup)
  afterEach(cleanup)

  async function licenseMonitor() {
    return Monitor.create({
      teamId: TEAM_ID,
      name: 'License API',
      url: `http://localhost:${server.port}/api/license/check`,
      type: 'uptime',
      config: JSON.stringify({ method: 'POST', body: { key: 'UPLK-2222-3333-4444-5555' }, expectedStatus: 404 }),
    })
  }

  async function latest(monitorId: number): Promise<{ status: string, message: string, statusCode: number }> {
    const results = await CheckResult.where('monitor_id', monitorId).orderByDesc('created_at').get()
    const row = results[0] as unknown as { status: string, message: string, status_code?: number, statusCode?: number }
    return { status: row.status, message: row.message, statusCode: Number(row.status_code ?? row.statusCode) }
  }

  test('sends the POST with its JSON body, and counts the expected 404 as up', async () => {
    answer = { status: 404, body: '{"valid":false}' }
    const monitor = await licenseMonitor()
    await Assertion.create({ monitor_id: monitor.id, target: 'body', property: 'valid', compare: 'eq', expected: 'false', sortOrder: 0 })

    await RunUptimeCheck.handle({ monitorId: monitor.id })

    expect(seen).toEqual([{ method: 'POST', contentType: 'application/json', body: '{"key":"UPLK-2222-3333-4444-5555"}' }])
    expect(await latest(monitor.id)).toMatchObject({ status: 'up', statusCode: 404 })
  })

  test('is down on a status it did not expect, even a 200, and says what it expected', async () => {
    answer = { status: 500, body: '{"error":"boom"}' }
    const monitor = await licenseMonitor()
    await RunUptimeCheck.handle({ monitorId: monitor.id })
    expect(await latest(monitor.id)).toMatchObject({ status: 'down', message: 'Unexpected status code 500 (expected 404)' })

    answer = { status: 200, body: '{"valid":true}' }
    await RunUptimeCheck.handle({ monitorId: monitor.id })
    expect((await latest(monitor.id)).status).toBe('down')
  })

  test('still fails on a JSON field when the status is the expected one', async () => {
    answer = { status: 404, body: '{"valid":true}' }
    const monitor = await licenseMonitor()
    await Assertion.create({ monitor_id: monitor.id, target: 'body', property: 'valid', compare: 'eq', expected: 'false', sortOrder: 0 })
    await RunUptimeCheck.handle({ monitorId: monitor.id })
    expect((await latest(monitor.id)).status).toBe('down')
  })

  test('a monitor with no request config is the same GET it always was', async () => {
    answer = { status: 200, body: 'ok' }
    const monitor = await Monitor.create({ teamId: TEAM_ID, name: 'Site', url: `http://localhost:${server.port}/`, type: 'uptime' })
    await RunUptimeCheck.handle({ monitorId: monitor.id })
    expect(seen.map(r => r.method)).toEqual(['GET'])
    expect((await latest(monitor.id)).status).toBe('up')
  })
})
