import { Action } from '@stacksjs/actions'
import { hq } from '../../Hq/service'

/**
 * POST /api/cli/connect, called by `buddy hq:connect statushq`.
 *
 * Answers a code, the page to approve it on, and the confirmation code the
 * terminal prints. Nothing is created for the app until somebody signed in
 * approves. Anyone may ask, so the route is rate limited by address.
 */
export default new Action({
  name: 'StartConnectAction',
  description: 'Begin connecting an app to StatusHQ from the CLI',

  async handle(request) {
    // The router has read the body already, so the package is handed what it
    // parsed rather than a stream that is spent.
    return hq.startConnect({
      url: String(request.url),
      method: 'POST',
      headers: request.headers,
      json: async () => ({ app: request.get('app') }),
    })
  },
})
