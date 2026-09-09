import { Action } from '@stacksjs/actions'
import { randomUUIDv7 } from 'bun'
import { parseServerForm } from '../../lib/serverForm'
import Monitor from '../../Models/Monitor'
import Server from '../../Models/Server'
import { requireTeamId } from '../../lib/teamGuard'

/**
 * `POST /server-forms/create` — the no-JS counterpart to CreateServerAction.
 *
 * Takes an optional `attach_monitor_id` so the monitor page can offer "this
 * box is not tracked yet, add it" without a detour: create the server and
 * attach the monitor in one submit, then land back on the monitor the
 * operator was already looking at rather than on a server page they did not
 * ask for.
 */
export default new Action({
  name: 'DashboardCreateServerAction',
  description: 'Create a server from a dashboard form',

  async handle(request) {
    const authTeamId = await requireTeamId(request)
    if (authTeamId instanceof Response)
      return authTeamId

    const attachMonitorId = String(request.get('attach_monitor_id') ?? '').trim()
    // Errors go back where the operator was, which is the monitor page when
    // they came from its attach dialog.
    const back = (query: string) => new Response(null, {
      status: 302,
      headers: {
        Location: attachMonitorId
          ? `/dashboard/monitors/${encodeURIComponent(attachMonitorId)}${query}`
          : `/dashboard/servers${query}`,
      },
    })

    const parsed = parseServerForm({
      name: request.get('name'),
      cpu_threshold: request.get('cpu_threshold'),
      ram_threshold: request.get('ram_threshold'),
      disk_threshold: request.get('disk_threshold'),
      metrics_window_seconds: request.get('metrics_window_seconds'),
    })
    if (parsed.error)
      return back(`?error=${parsed.error}`)

    const server = await Server.create({
      teamId: authTeamId,
      name: parsed.values.name,
      cpuThreshold: parsed.values.cpu_threshold,
      ramThreshold: parsed.values.ram_threshold,
      diskThreshold: parsed.values.disk_threshold,
      metricsWindowSeconds: parsed.values.metrics_window_seconds,
      metricsToken: randomUUIDv7().replace(/-/g, ''),
    })

    if (attachMonitorId) {
      const monitor = await Monitor.where('id', Number(attachMonitorId)).where('team_id', authTeamId).first()
      // A monitor outside the team is not an error worth losing the server
      // over: the box was created, so say so and let them attach by hand.
      if (!monitor)
        return back('?error=monitor_not_found')
      await monitor.update({ server_id: Number(server.id) })
      return back('?server=1')
    }

    return new Response(null, { status: 302, headers: { Location: `/dashboard/servers/${server.id}?created=1` } })
  },
})
