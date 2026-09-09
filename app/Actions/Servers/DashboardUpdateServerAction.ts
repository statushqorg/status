import { Action } from '@stacksjs/actions'
import { parseServerForm } from '../../lib/serverForm'
import Server from '../../Models/Server'
import { requireTeamId } from '../../lib/teamGuard'

/**
 * `POST /server-forms/{serverId}/update` — name and thresholds.
 *
 * Writes only what the form owns. `status`, `last_sample_at` and
 * `metrics_token` are not form fields and are not touched here; the first two
 * belong to the ingest and to CheckStaleServers, and the third has its own
 * action so that rotating a credential is never something that happens as a
 * side effect of renaming a box.
 *
 * Widening the window on a quiet server leaves it quiet with its
 * `server_silent` incident open until the next CheckStaleServers tick, which
 * recomputes the status from the now-in-window samples and resolves it. That
 * is why the flash says the status re-evaluates within a minute rather than
 * claiming the save fixed it.
 */
export default new Action({
  name: 'DashboardUpdateServerAction',
  description: 'Update a server from the dashboard form',

  async handle(request) {
    const authTeamId = await requireTeamId(request)
    if (authTeamId instanceof Response)
      return authTeamId

    const serverId = Number(request.get('serverId'))
    const back = (query: string) => new Response(null, {
      status: 302,
      headers: { Location: `/dashboard/servers/${serverId}${query}` },
    })

    const server = await Server.where('id', serverId).where('team_id', authTeamId).first()
    if (!server)
      return new Response(null, { status: 302, headers: { Location: '/dashboard/servers?error=server_not_found' } })

    const parsed = parseServerForm({
      name: request.get('name'),
      cpu_threshold: request.get('cpu_threshold'),
      ram_threshold: request.get('ram_threshold'),
      disk_threshold: request.get('disk_threshold'),
      metrics_window_seconds: request.get('metrics_window_seconds'),
    })
    if (parsed.error)
      return back(`?error=${parsed.error}`)

    await server.update({
      name: parsed.values.name,
      cpuThreshold: parsed.values.cpu_threshold,
      ramThreshold: parsed.values.ram_threshold,
      diskThreshold: parsed.values.disk_threshold,
      metricsWindowSeconds: parsed.values.metrics_window_seconds,
    })

    return back('?saved=1')
  },
})
