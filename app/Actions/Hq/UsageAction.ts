import { Action } from '@stacksjs/actions'
import { hq } from '../../Hq/service'

/**
 * GET /api/v1/usage, read with an app's read key: the team's monitors against
 * its plan, in the shape every HQ service answers (`buddy hq:status`).
 */
export default new Action({
  name: 'UsageAction',
  description: 'Report monitors used against the plan for a connected app',

  async handle(request) {
    return hq.usage({ url: String(request.url), headers: request.headers })
  },
})
