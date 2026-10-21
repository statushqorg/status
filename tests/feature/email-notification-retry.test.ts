import { expect, spyOn, test } from 'bun:test'
import { mail } from '@stacksjs/email'
import SendNotification from '../../app/Jobs/SendNotification'
import NotificationChannel from '../../app/Models/NotificationChannel'

test('an unsuccessful email transport rejects the job so queue retries apply', async () => {
  const channel = await NotificationChannel.create({ teamId: 90088, name: 'Email retry fixture', type: 'email',
    enabled: true, config: JSON.stringify({ email: 'owner@example.test' }) })
  const send = spyOn(mail, 'send').mockResolvedValue({ success: false, message: 'SMTP temporarily unavailable' })
  try {
    await expect(SendNotification.handle({ channelId: channel.id, subject: 'Delivery outage', message: 'Storage check failed', severity: 'critical' })).rejects.toThrow()
    expect(send).toHaveBeenCalledTimes(1)
  }
  finally { send.mockRestore(); await channel.delete() }
})
