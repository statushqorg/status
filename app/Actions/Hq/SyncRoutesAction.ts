import { Action } from '@stacksjs/actions'
import { log } from '@stacksjs/logging'
import { appForIngestKey } from '../../Hq/adapter'
import { bearerKey } from '../../Hq/keys'
import { routeSyncDeps, sqlAppStore } from '../../Hq/service'
import { syncRoutes } from '../../Hq/sync'

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
}

/**
 * POST /api/v1/routes/sync, sent by `buddy hq:sync` and by `buddy deploy` with
 * an app's ingest key.
 *
 * Takes the app's routes and brings its one monitor in line with them: see
 * app/Hq/sync.ts for what that changes and app/Hq/routeSuite.ts for what a
 * check may be. The key says which app, so nothing in the body can aim a sync
 * at another team's monitor.
 */
export default new Action({
  name: 'SyncRoutesAction',
  description: 'Reconcile a connected app\'s route checks from its manifest',

  async handle(request) {
    const app = await appForIngestKey(sqlAppStore, bearerKey(request.headers))
    if (!app)
      return json({ error: 'unauthorized' }, 401)

    try {
      const result = await syncRoutes(routeSyncDeps, app, { baseUrl: request.get('baseUrl'), manifest: request.get('manifest') })
      return json(result.body, result.status)
    }
    catch (error) {
      log.error(`[hq] route sync failed for app ${app.id}: ${error instanceof Error ? error.message : String(error)}`)
      return json({ error: 'The routes could not be saved. Try again.' }, 500)
    }
  },
})
