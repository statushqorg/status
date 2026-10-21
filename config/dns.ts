import type { DnsConfig } from '@stacksjs/types'

/** Extra records owned by StatusHQ. App addresses come from cloud.ts. */
export default {
  a: [],
  aaaa: [],
  cname: [],
  // Keep receiving mail on the shared service when app compute moves.
  mx: [{ name: '@', mailServer: 'mail.stacksjs.com', ttl: 600, priority: 10 }],
  txt: [],
  nameservers: ['curitiba.ns.porkbun.com', 'fortaleza.ns.porkbun.com', 'maceio.ns.porkbun.com', 'salvador.ns.porkbun.com'],
} satisfies DnsConfig
