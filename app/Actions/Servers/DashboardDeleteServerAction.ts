import { Action } from '@stacksjs/actions'
import { transaction } from '@stacksjs/orm'
import Server from '../../Models/Server'
import { requireTeamId } from '../../lib/teamGuard'

/**
 * `POST /server-forms/{serverId}/delete` — remove a box.
 *
 * One transaction, and query-builder writes only. That is deliberate on both
 * counts. One transaction because a half-deleted server is worse than either
 * outcome: monitors detached but samples kept, or the row gone while its
 * incidents stay open and CheckStaleServers keeps reconciling a box that no
 * longer exists.
 *
 * Query builder rather than model calls because model writes fire observers,
 * and `incident:updated` on a resolve sends a "has recovered" notification.
 * Paging a team to say a box they just deleted is fine again is noise, so the
 * resolve happens beneath the observer layer on purpose.
 *
 * Monitors are detached, not deleted: they are checks that happened to run
 * here and they keep working. Incidents are kept as history with their
 * `server_id` now pointing at nothing, which the incidents index renders as
 * "Deleted server" rather than hiding.
 */
export default new Action({
  name: 'DashboardDeleteServerAction',
  description: 'Delete a server from the dashboard',

  async handle(request) {
    const authTeamId = await requireTeamId(request)
    if (authTeamId instanceof Response)
      return authTeamId

    const serverId = Number(request.get('serverId'))
    const server = await Server.where('id', serverId).where('team_id', authTeamId).first()
    if (!server)
      return new Response(null, { status: 302, headers: { Location: '/dashboard/servers?error=server_not_found' } })

    const at = new Date().toISOString()

    await transaction(async (tx) => {
      await tx.updateTable('monitors').set({ server_id: null }).where('server_id', '=', serverId).execute()

      const open = await tx.selectFrom('incidents')
        .where('server_id', '=', serverId)
        .where('resolved_at', 'is', null)
        .select(['id'])
        .execute()

      for (const row of open) {
        const incidentId = Number(row.id)
        await tx.updateTable('incidents')
          .set({ status: 'resolved', resolved_at: at, updated_at: at })
          .where('id', '=', incidentId)
          .execute()
        await tx.insertInto('incident_updates').values({
          incident_id: incidentId,
          message: 'Server deleted.',
          status: 'resolved',
          posted_at: at,
          created_at: at,
          updated_at: at,
          uuid: crypto.randomUUID(),
        } as never).execute()
      }

      await tx.deleteFrom('server_metric_samples').where('server_id', '=', serverId).execute()
      await tx.deleteFrom('servers').where('id', '=', serverId).execute()
    })

    return new Response(null, { status: 302, headers: { Location: '/dashboard/servers?deleted=1' } })
  },
})
