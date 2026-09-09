import { Action } from '@stacksjs/actions'
import { randomUUIDv7 } from 'bun'
import Server from '../../Models/Server'
import { requireTeamId } from '../../lib/teamGuard'

/**
 * `POST /server-forms/{serverId}/rotate-token` — mint a new agent credential.
 *
 * The already-installed agent breaks the moment this returns, and there is no
 * grace period: the ingest resolves a push by exact token, so the old one
 * stops resolving. The page says so before the button, and the button
 * confirms, because "rotate" reads harmless and this is the one control here
 * that stops data arriving.
 */
export default new Action({
  name: 'DashboardRotateServerTokenAction',
  description: 'Rotate a server agent token',

  async handle(request) {
    const authTeamId = await requireTeamId(request)
    if (authTeamId instanceof Response)
      return authTeamId

    const serverId = Number(request.get('serverId'))
    const server = await Server.where('id', serverId).where('team_id', authTeamId).first()
    if (!server)
      return new Response(null, { status: 302, headers: { Location: '/dashboard/servers?error=server_not_found' } })

    await server.update({ metricsToken: randomUUIDv7().replace(/-/g, '') })

    return new Response(null, { status: 302, headers: { Location: `/dashboard/servers/${serverId}?rotated=1` } })
  },
})
