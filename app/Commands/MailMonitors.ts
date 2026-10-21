import type { CLI } from '@stacksjs/types'
import process from 'node:process'
import { transaction } from '@stacksjs/orm'
import Monitor from '../Models/Monitor'
import MonitorNotificationChannel from '../Models/MonitorNotificationChannel'
import NotificationChannel from '../Models/NotificationChannel'
import TeamMember from '../Models/TeamMember'
import User from '../Models/User'
import { mailMonitorSuite } from '../lib/mailMonitorSuite'

export interface MailSuiteOptions {
  email: string
  teamId: number
  hostname: string
  healthSecret: string
  channelIds: number[]
  dryRun?: boolean
}

/** Refuses ambiguous ownership, cross-team channels, and incomplete alert routing. */
export async function provisionMailMonitors(options: MailSuiteOptions): Promise<{ id: number, name: string }[]> {
  const user = await User.where('email', options.email.trim().toLowerCase()).first()
  if (!user)
    throw new Error('The requested account does not exist')
  const membership = await TeamMember.where('user_id', user.id).where('team_id', options.teamId).where('status', 'active').first()
  if (!membership || !['owner', 'admin'].includes(membership.role))
    throw new Error('The account must be an active owner or admin of the selected team')
  const channels = await NotificationChannel.where('team_id', options.teamId).where('enabled', true).get()
  const selected = channels.filter(channel => options.channelIds.includes(channel.id))
  if (!options.channelIds.length || selected.length !== new Set(options.channelIds).size)
    throw new Error('Every alert channel must exist, be enabled, and belong to the selected team')
  if (!selected.some(channel => channel.type !== 'email'))
    throw new Error('Mail monitoring requires an independent non-email alert channel')
  const suite = mailMonitorSuite(options.hostname, options.healthSecret)
  const existing = await Monitor.where('team_id', options.teamId).get()
  const matches = suite.map(definition => {
    const rows = existing.filter((monitor) => {
      try {
        const marker = JSON.parse(monitor.config || '{}').mailSuite
        return marker?.hostname === options.hostname && marker?.key === definition.key
      }
      catch { return false }
    })
    if (rows.length > 1)
      throw new Error(`Duplicate managed monitor: ${definition.key}`)
    return { definition, monitor: rows[0] }
  })
  if (options.dryRun)
    return matches.map(({ definition, monitor }) => ({ id: monitor?.id ?? 0, name: definition.name }))
  return transaction(async () => {
    const result: { id: number, name: string }[] = []
    for (const { definition, monitor } of matches) {
      const values = { name: definition.name, url: definition.url, type: definition.type, enabled: true,
        checkIntervalSeconds: definition.interval, config: JSON.stringify(definition.config) }
      const row = monitor ? await monitor.update(values) : await Monitor.create({ ...values, teamId: options.teamId })
      for (const channel of selected) {
        const pivot = await MonitorNotificationChannel.where('monitor_id', row.id).where('notification_channel_id', channel.id).first()
        if (!pivot)
          await MonitorNotificationChannel.create({ monitor_id: row.id, notification_channel_id: channel.id, firesOn: 'both' })
        else if (pivot.fires_on !== 'both')
          await pivot.update({ firesOn: 'both' })
      }
      result.push({ id: row.id, name: definition.name })
    }
    return result
  })
}

export default function (cli: CLI) {
  cli.command('mail:monitors', 'Install or refresh a complete mail health suite in an existing account')
    .option('--email <email>', 'Existing account email')
    .option('--team <id>', 'Team the account administers')
    .option('--host <hostname>', 'Mail hostname')
    .option('--channels <ids>', 'Comma-separated existing alert channel IDs')
    .option('--dry-run', 'Validate ownership and print the suite without writing', { default: false })
    .action(async (options: { email: string, team: string, host: string, channels: string, dryRun: boolean }) => {
      // Credential arrives on stdin, never in argv, shell history or command output.
      const healthSecret = (await Bun.stdin.text()).trim()
      try {
        const monitors = await provisionMailMonitors({ email: options.email, teamId: Number(options.team),
          hostname: options.host, channelIds: options.channels.split(',').map(Number), healthSecret, dryRun: options.dryRun })
        console.log(JSON.stringify({ dryRun: options.dryRun, monitors }))
      }
      catch (error) {
        console.error(error instanceof Error ? error.message : 'Mail monitor provisioning failed')
        process.exitCode = 1
      }
    })
}
