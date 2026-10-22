import type { Server } from 'bun'
import { afterAll, beforeAll, expect, test } from 'bun:test'
import SendNotification from '../../app/Jobs/SendNotification'
import RunHealthCheck from '../../app/Jobs/RunHealthCheck'
import SendIncidentNotification from '../../app/Actions/Notifications/SendIncidentNotification'
import { MAIL_REQUIRED_CHECKS } from '../../app/lib/mailMonitorSuite'
import CheckResult from '../../app/Models/CheckResult'
import Monitor from '../../app/Models/Monitor'
import MonitorNotificationChannel from '../../app/Models/MonitorNotificationChannel'
import NotificationChannel from '../../app/Models/NotificationChannel'

let server: Server
let status = 204
const received: any[] = []
let healthReport: unknown
beforeAll(() => {
  server = Bun.serve({ port: 0, async fetch(request) {
    if (new URL(request.url).pathname === '/health')
      return Response.json(healthReport, { status: 503 })
    received.push(await request.json())
    return new Response(status === 204 ? null : 'private provider response', { status })
  } })
})

test('every mail indicator produces a failed observation and a Discord incident notice naming it', async () => {
  const channel = await NotificationChannel.create({ teamId: 90089, name: 'Mail indicator Discord fixture',
    type: 'discord', enabled: true, config: JSON.stringify({ webhookUrl: `http://localhost:${server.port}/hook` }) })
  const monitor = await Monitor.create({ teamId: 90089, name: 'Mail delivery fixture', type: 'health', status: 'up',
    url: `http://localhost:${server.port}/health`, config: JSON.stringify({ healthRequiredChecks: MAIL_REQUIRED_CHECKS }) })
  const attachment = await MonitorNotificationChannel.create({ monitor_id: monitor.id, notification_channel_id: channel.id, firesOn: 'both' })
  status = 204
  try {
    for (const name of MAIL_REQUIRED_CHECKS) {
      healthReport = { schema: 1, checked_at: Math.floor(Date.now() / 1000), status: 'degraded',
        checks: MAIL_REQUIRED_CHECKS.map(check => ({ name: check, ok: check !== name })) }
      await RunHealthCheck.handle({ monitorId: monitor.id })
      const observation = await CheckResult.where('monitor_id', monitor.id).orderByDesc('id').first()
      expect(observation?.status).toBe('down')
      expect(observation?.message).toContain(name)
      await SendIncidentNotification.handle({ monitor_id: monitor.id, status: 'investigating',
        cause: observation!.message, started_at: new Date().toISOString() } as any)
      expect(received.at(-1).content).toContain(name)
    }
  }
  finally {
    for (const result of await CheckResult.where('monitor_id', monitor.id).get()) await result.delete()
    await attachment.delete()
    await monitor.delete()
    await channel.delete()
  }
})
afterAll(() => server.stop(true))

for (const provider of ['discord', 'slack', 'teams']) {
  test(`${provider} rejection reaches queue retries and a later delivery succeeds`, async () => {
    const channel = await NotificationChannel.create({ teamId: 90089, name: `${provider} retry fixture`,
      type: provider, enabled: true, config: JSON.stringify({ webhookUrl: `http://localhost:${server.port}/hook` }) })
    const payload = { channelId: channel.id, subject: 'Mail check failed', message: 'Storage failures', severity: 'critical' as const }
    try {
      for (const rejected of [429, 500]) {
        status = rejected
        await expect(SendNotification.handle(payload)).rejects.toThrow(`${provider} notification was not accepted`)
      }
      status = 204
      await SendNotification.handle(payload)
      const body = received.at(-1)
      expect(JSON.stringify(body)).toContain('Storage failures')
    }
    finally { await channel.delete() }
  })
}

test('Discord network failure rejects without exposing the webhook URL', async () => {
  const channel = await NotificationChannel.create({ teamId: 90089, name: 'Discord network retry fixture',
    type: 'discord', enabled: true, config: JSON.stringify({ webhookUrl: 'http://127.0.0.1:1/private-webhook-token' }) })
  try {
    await expect(SendNotification.handle({ channelId: channel.id, subject: 'Mail check failed', message: 'TLS receive errors',
      severity: 'critical' })).rejects.toThrow('discord notification was not accepted')
  }
  finally { await channel.delete() }
})
