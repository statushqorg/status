import { afterAll, beforeAll, expect, test } from 'bun:test'
import { db } from '@stacksjs/database'
import { provisionMailMonitors } from '../../app/Commands/MailMonitors'
import Monitor from '../../app/Models/Monitor'
import NotificationChannel from '../../app/Models/NotificationChannel'
import { mailMonitorSuite, MAIL_REQUIRED_CHECKS } from '../../app/lib/mailMonitorSuite'

const email = 'mail-suite-owner@example.test'
let teamId: number
let userId: number
let channelId: number
beforeAll(async () => {
  await db.insertInto('users').values({ name: 'Mail suite owner', email, password: 'test-only-password' }).execute()
  userId = Number((await db.selectFrom('users').select('id').where('email', '=', email).executeTakeFirst())!.id)
  await db.insertInto('teams').values({ name: 'Mail suite tests' }).execute()
  teamId = Number((await db.selectFrom('teams').select('id').where('name', '=', 'Mail suite tests').executeTakeFirst())!.id)
  await db.insertInto('team_members').values({ team_id: teamId, user_id: userId, invited_email: email, role: 'owner', status: 'active' }).execute()
  channelId = (await NotificationChannel.create({ teamId, name: 'Independent alerts', type: 'discord', enabled: true, config: '{}' })).id
})
afterAll(async () => {
  for (const monitor of await Monitor.where('team_id', teamId).get()) {
    await db.deleteFrom('monitor_notification_channels').where('monitor_id', '=', monitor.id).execute()
    await monitor.delete()
  }
  await db.deleteFrom('notification_channels').where('team_id', '=', teamId).execute()
  await db.deleteFrom('team_members').where('team_id', '=', teamId).execute()
  await db.deleteFrom('teams').where('id', '=', teamId).execute()
  await db.deleteFrom('users').where('id', '=', userId).execute()
})
const secret = 'a'.repeat(64)
const options = () => ({ email, teamId, hostname: 'mail.example.test', healthSecret: secret, channelIds: [channelId] })

test('suite requires every mail check, external listeners and certificate verification', () => {
  const suite = mailMonitorSuite('mail.example.test', secret)
  expect(suite).toHaveLength(8)
  expect(suite.every(monitor => monitor.config.maxBackoffMultiplier === 1)).toBe(true)
  expect(suite[0]?.config.healthRequiredChecks).toEqual(MAIL_REQUIRED_CHECKS)
  expect(suite[0]?.config.healthMaxAgeSeconds).toBe(180)
  expect(suite.filter(monitor => monitor.type === 'tcp_port').map(monitor => monitor.config.port)).toEqual([25, 143, 465, 587, 993])
  expect(() => mailMonitorSuite('host/redirect', secret)).toThrow()
  expect(() => mailMonitorSuite('mail.example.test', 'mailbox-password')).toThrow()
})
test('ownership and independent alert channels are mandatory before any write', async () => {
  await expect(provisionMailMonitors({ ...options(), email: 'missing@example.test' })).rejects.toThrow('account does not exist')
  await expect(provisionMailMonitors({ ...options(), teamId: teamId + 9999 })).rejects.toThrow('active owner or admin')
  await expect(provisionMailMonitors({ ...options(), channelIds: [channelId + 9999] })).rejects.toThrow('belong to the selected team')
  expect(await Monitor.where('team_id', teamId).count()).toBe(0)
})
test('dry run is read-only and provisioning is idempotent with recovery alerts', async () => {
  expect(await provisionMailMonitors({ ...options(), dryRun: true })).toHaveLength(8)
  expect(await Monitor.where('team_id', teamId).count()).toBe(0)
  const first = await provisionMailMonitors(options())
  const second = await provisionMailMonitors(options())
  expect(second).toEqual(first)
  expect(await Monitor.where('team_id', teamId).count()).toBe(8)
  const pivots = await db.selectFrom('monitor_notification_channels').selectAll().where('notification_channel_id', '=', channelId).execute()
  expect(pivots).toHaveLength(8)
  expect(pivots.every(pivot => pivot.fires_on === 'both')).toBe(true)
})
