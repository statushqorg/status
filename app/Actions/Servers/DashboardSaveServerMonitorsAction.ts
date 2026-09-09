import { Action } from '@stacksjs/actions'
import Monitor from '../../Models/Monitor'
import Server from '../../Models/Server'
import { requireTeamId } from '../../lib/teamGuard'

/**
 * `POST /server-forms/{serverId}/monitors` — set this box's whole monitor
 * list in one submit.
 *
 * The routing-grid shape, and for the same reason: absence means detach, and
 * an unchecked checkbox posts nothing at all. So the reconcile is driven by
 * the team's monitor list rather than by what arrived, because iterating the
 * posted fields could never see a box the operator just emptied.
 *
 * A monitor already on another server may be moved here. There is no pivot
 * and no exclusivity to enforce beyond the single column: `monitors.server_id`
 * names one box, so checking it here is what moves it.
 */
export default new Action({
  name: 'DashboardSaveServerMonitorsAction',
  description: 'Save the full set of monitors attached to a server',

  async handle(request) {
    const authTeamId = await requireTeamId(request)
    if (authTeamId instanceof Response)
      return authTeamId

    const serverId = Number(request.get('serverId'))
    const server = await Server.where('id', serverId).where('team_id', authTeamId).first()
    if (!server)
      return new Response(null, { status: 302, headers: { Location: '/dashboard/servers?error=server_not_found' } })

    const teamMonitors = await Monitor.where('team_id', authTeamId).get()

    for (const monitor of teamMonitors) {
      const wanted = !!request.get(`mon_${Number(monitor.id)}`)
      const current = monitor.server_id === null || monitor.server_id === undefined ? null : Number(monitor.server_id)

      if (wanted) {
        if (current !== serverId)
          await monitor.update({ server_id: serverId })
        continue
      }

      // Only detach from THIS server. A monitor sitting on another box is
      // unchecked here because it belongs elsewhere, not because the operator
      // asked to orphan it.
      if (current === serverId)
        await monitor.update({ server_id: null })
    }

    return new Response(null, { status: 302, headers: { Location: `/dashboard/servers/${serverId}?monitors=1` } })
  },
})
