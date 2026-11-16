import { Action } from '@stacksjs/actions'
import { resolveAuthenticatedUser } from '@stacksjs/auth'
import { log } from '@stacksjs/logging'
import { rateLimit } from '../../Hq/limits'
import { sameOrigin } from '../../Hq/origin'
import { hq } from '../../Hq/service'
import { requireTeamId } from '../../lib/teamGuard'

function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    // Codes travel in these bodies: nothing may keep one.
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  })
}

// Wrong guesses are limited per person: the confirmation code is six
// characters, and ten tries a minute cannot find it within the ten minutes a
// connect lives.
const APPROVE_LIMIT = 10
const APPROVE_WINDOW_MS = 60_000

/**
 * POST /api/cli/connect/{code}/approve, the approve page's button.
 *
 * Cookie-authenticated, so it checks the Origin: approving hands an app's keys
 * to whoever holds the code, which is what a forged cross-site POST would
 * want. The app is made under the team the session is acting for, never one
 * named in the request. The framework refuses without the confirmation code
 * the terminal printed, and answers `confirmation_mismatch`.
 */
export default new Action({
  name: 'ApproveConnectAction',
  description: 'Approve a CLI connect as the signed-in team',

  async handle(request) {
    if (!sameOrigin(request.headers))
      return json({ error: 'forbidden' }, 403)

    const teamId = await requireTeamId(request)
    if (teamId instanceof Response)
      return teamId
    const user = await resolveAuthenticatedUser(request as never)
    if (!user?.id)
      return json({ error: 'unauthorized' }, 401)

    const limit = rateLimit(`hq-approve:${Number(user.id)}`, APPROVE_LIMIT, APPROVE_WINDOW_MS)
    if (!limit.ok)
      return json({ error: 'Too many attempts. Wait a minute and try again.' }, 429, { 'Retry-After': String(limit.retryAfter) })

    try {
      const result = await hq.approveConnect(String(request.get('code') ?? ''), { id: Number(user.id), teamId }, request.get('confirm'))
      if (!result.ok) {
        if (result.reason === 'confirmation_mismatch') {
          return json({
            error: 'That code does not match. Enter the confirmation code your terminal is showing.',
            reason: result.reason,
          }, 422)
        }
        return json({
          error: result.reason === 'already_approved'
            ? 'This connection was already approved.'
            : 'This connection request has expired. Run the command again.',
          reason: result.reason,
        }, result.reason === 'already_approved' ? 409 : 410)
      }
      return json({ ok: true, project: result.project })
    }
    catch (error) {
      log.error(`[hq] could not approve connect: ${error instanceof Error ? error.message : String(error)}`)
      return json({ error: 'Could not approve the connection. Please try again.' }, 500)
    }
  },
})
