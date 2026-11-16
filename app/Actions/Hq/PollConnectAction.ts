import { Action } from '@stacksjs/actions'
import { hq } from '../../Hq/service'

/**
 * GET /api/cli/connect/{code}: pending, or the app's keys exactly once, or
 * expired. The CLI polls this while the person approves.
 */
export default new Action({
  name: 'PollConnectAction',
  description: 'Collect the keys of an approved connect, once',

  async handle(request) {
    return hq.pollConnect({ url: String(request.url), headers: request.headers }, String(request.get('code') ?? ''))
  },
})
