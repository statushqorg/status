import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { randomUUIDv7 } from 'bun'
import { parseServerForm } from '../../lib/serverForm'
import Server from '../../Models/Server'
import { requireTeamId } from '../../lib/teamGuard'

/**
 * `POST /api/servers` — create a box, JSON.
 *
 * This is where the agent credential is minted now. It used to be minted on a
 * monitor, which is why the monitor actions no longer do: a token belongs to
 * the machine that pushes, not to one of the checks that happen to run on it.
 *
 * `metrics_token` is `hidden: true` on the model, so the auto-CRUD layer
 * strips it from write bodies and nothing else could ever mint one. It is
 * also absent from the response for the same reason: the token is shown once,
 * on the server page's agent-setup card, to somebody who can already see the
 * box.
 *
 * `status` takes the column default of `unknown` and `last_sample_at` stays
 * null. Neither is a field a caller may set: a box becomes healthy by pushing,
 * not by being described as healthy.
 */
export default new Action({
  name: 'CreateServerAction',
  description: 'Create a server',
  method: 'POST',

  async handle(request) {
    const authTeamId = await requireTeamId(request)
    if (authTeamId instanceof Response)
      return authTeamId

    // A caller may name their own team and no other. Same check the monitor
    // create makes, for the same reason.
    const requestedTeam = request.get('team_id')
    if (requestedTeam !== undefined && requestedTeam !== null && Number(requestedTeam) !== Number(authTeamId))
      return response.forbidden('You do not have access to that team')

    const parsed = parseServerForm({
      name: request.get('name'),
      cpu_threshold: request.get('cpu_threshold'),
      ram_threshold: request.get('ram_threshold'),
      disk_threshold: request.get('disk_threshold'),
      metrics_window_seconds: request.get('metrics_window_seconds'),
    })
    if (parsed.error)
      return response.json({ error: parsed.error }, { status: 422 })

    const server = await Server.create({
      teamId: authTeamId,
      name: parsed.values.name,
      cpuThreshold: parsed.values.cpu_threshold,
      ramThreshold: parsed.values.ram_threshold,
      diskThreshold: parsed.values.disk_threshold,
      metricsWindowSeconds: parsed.values.metrics_window_seconds,
      metricsToken: randomUUIDv7().replace(/-/g, ''),
    })

    return response.json({
      id: server.id,
      name: server.name,
      status: server.status,
      cpu_threshold: server.cpu_threshold,
      ram_threshold: server.ram_threshold,
      disk_threshold: server.disk_threshold,
      metrics_window_seconds: server.metrics_window_seconds,
    }, { status: 201 })
  },
})
