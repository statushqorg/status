import { Action } from '@stacksjs/actions'
import { confirmTwoFactorSetup, resolveAuthenticatedUser } from '@stacksjs/auth'
import { response } from '@stacksjs/router'

/**
 * `POST /security-forms/two-factor/enable` - confirms TOTP setup from the
 * Security settings page and hands back the account's recovery codes.
 *
 * The secret is NEVER taken from the client: the Security page stashed it
 * server-side when it rendered the setup step (stashPendingTwoFactorSecret,
 * 10 minute TTL), so this action only needs the 6-digit code.
 * `confirmTwoFactorSetup` verifies it against that stash, turns the factor on
 * and creates the recovery codes in one transaction; a mistyped code leaves
 * the stash in place, so the QR the person already scanned stays usable.
 *
 * It answers JSON rather than redirecting, because the recovery codes exist in
 * plaintext only in this one response: the framework stores a hash of each and
 * nothing can read them back. A redirect would have to carry them in a URL, a
 * cookie or a server-side stash, and the views server is a separate process
 * from this one. `no-store` keeps the response out of every cache on the way.
 */

/** Recovery codes in a body must not be kept by a browser or a proxy. */
const NO_STORE = { 'Cache-Control': 'private, no-store' }

const REFUSALS = {
  missing: 'That setup session expired. Start again to get a fresh secret.',
  invalid: 'That code did not match. Scan the current QR secret and try again.',
  already_enabled: 'Two-factor authentication is already on for this account.',
} as const

export default new Action({
  name: 'DashboardEnableTwoFactorAction',
  description: 'Enable TOTP two-factor auth from the dashboard and return its recovery codes once',

  async handle(request) {
    const user = await resolveAuthenticatedUser(request)
    if (!user)
      return response.unauthorized('Authentication required')

    const code = String(request.get('code') ?? '').trim()
    if (!/^\d{6}$/.test(code))
      return response.json({ error: REFUSALS.invalid, reason: 'invalid' }, { status: 422, headers: NO_STORE })

    const result = await confirmTwoFactorSetup(user.id, code)
    if (!result.enabled)
      return response.json({ error: REFUSALS[result.reason], reason: result.reason }, { status: 422, headers: NO_STORE })

    return response.json({ enabled: true, recoveryCodes: result.recoveryCodes }, { headers: NO_STORE })
  },
})
