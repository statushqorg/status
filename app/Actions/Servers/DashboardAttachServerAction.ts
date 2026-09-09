import { Action } from '@stacksjs/actions'
import Monitor from '../../Models/Monitor'
import Server from '../../Models/Server'
import { requireTeamId } from '../../lib/teamGuard'

/**
 * `POST /server-forms/monitors/{monitorId}/server` — attach one monitor to
 * one box, from the monitor's own page.
 *
 * The same column as DashboardSaveServerMonitorsAction writes, from the other
 * direction, with the same team check on both ends. An empty `server_id`
 * detaches; there is no separate detach endpoint, because "none" is a real
 * answer to "which box does this run on" rather than a different operation.
 */
export default new Action({
  name: 'DashboardAttachServerAction',
  description: 'Attach a monitor to a server from the monitor page',

  async handle(request) {
    const authTeamId = await requireTeamId(request)
    if (authTeamId instanceof Response)
      return authTeamId

    const monitorId = Number(request.get('monitorId'))
    const back = (query: string) => new Response(null, {
      status: 302,
      headers: { Location: `/dashboard/monitors/${monitorId}${query}` },
    })

    const monitor = await Monitor.where('id', monitorId).where('team_id', authTeamId).first()
    if (!monitor)
      return new Response(null, { status: 302, headers: { Location: '/dashboard/monitors?error=monitor_not_found' } })

    const raw = String(request.get('server_id') ?? '').trim()
    if (raw === '') {
      await monitor.update({ server_id: null })
      return back('?server=1')
    }

    const server = await Server.where('id', Number(raw)).where('team_id', authTeamId).first()
    if (!server)
      return back('?error=server_not_found')

    await monitor.update({ server_id: Number(server.id) })
    return back('?server=1')
  },
})
