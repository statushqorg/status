/** Stable names let operators require every delivery check, including alert delivery. */
export const MAIL_REQUIRED_CHECKS = [
  'SMTP STARTTLS TLSv1_2', 'Submission STARTTLS TLSv1_2', 'SMTPS TLSv1_2',
  'SMTP STARTTLS TLSv1_3', 'Submission STARTTLS TLSv1_3', 'SMTPS TLSv1_3',
  'IMAPS greeting and CAPABILITY',
  'SMTP TLSv1_3 with 0 padding bytes', 'SMTP TLSv1_3 with 1 padding bytes',
  'SMTP TLSv1_3 with 16 padding bytes', 'SMTP TLSv1_3 with 255 padding bytes',
  'TLS receive errors', 'Storage failures', 'Pre-greeting DNSBL rejections',
  'Delivery error monitoring', 'Mail storage free space', 'Mail storage write and sync',
  'Admin alert transport',
] as const

export interface MailMonitorDefinition {
  key: string
  name: string
  url: string
  type: 'health' | 'uptime' | 'ssl' | 'tcp_port' | 'dns'
  interval: number
  config: Record<string, unknown>
}

/** No mailbox credential is ever needed. HTTPS is mandatory for the read token. */
export function mailMonitorSuite(hostname: string, healthSecret: string): MailMonitorDefinition[] {
  if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/i.test(hostname))
    throw new Error('A fully qualified mail hostname is required')
  if (!/^[a-f0-9]{64}$/.test(healthSecret))
    throw new Error('The mail health read token must contain 64 lowercase hex characters')
  const url = `https://${hostname}`
  const definitions: MailMonitorDefinition[] = [
    { key: 'delivery', name: 'Delivery health', url: `${url}/health/report`, type: 'health', interval: 60,
      config: { healthSecret, healthMaxAgeSeconds: 180, healthRequiredChecks: MAIL_REQUIRED_CHECKS } },
    { key: 'public', name: 'Public health', url: `${url}/healthz`, type: 'uptime', interval: 60, config: {} },
    { key: 'certificate', name: 'TLS certificate', url: `${url}:465`, type: 'ssl', interval: 3600, config: {} },
    ...[25, 143, 465, 587, 993].map(port => ({ key: `tcp-${port}`, name: `TCP ${port}`, url,
      type: 'tcp_port' as const, interval: 60, config: { port } })),
  ]
  return definitions.map(definition => ({ ...definition,
    name: `${hostname}: ${definition.name}`,
    config: { ...definition.config, mailSuite: { version: 1, hostname, key: definition.key } },
  }))
}
