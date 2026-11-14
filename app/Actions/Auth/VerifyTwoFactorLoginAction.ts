import type { RequestInstance } from '@stacksjs/types'
import { Action } from '@stacksjs/actions'
import { Auth, verifyTwoFactorCredential, withTwoFactorChallenge } from '@stacksjs/auth'
import { response } from '@stacksjs/router'
import { schema } from '@stacksjs/validation'
import { buildAuthCookie, sessionExpiryMinutes } from '../../Support/authCookie'

/**
 * Project override of the framework's default VerifyTwoFactorLoginAction
 * (registered in routes/api.ts, which wins over the framework copy).
 *
 * Identical challenge/TOTP verification, plus the same HttpOnly cookie
 * mirroring LoginAction/RegisterAction do — otherwise a 2FA-enabled user
 * completes the second step but the server-rendered dashboard can't see
 * their session. See Actions/Auth/authCookie.ts.
 *
 * The verification is the framework's current one: the challenge is consumed
 * and the session issued under the same lock a credential reset takes, so a
 * password reset cannot land between the second factor and the token. It also
 * accepts a recovery code wherever an account has them.
 */
export default new Action({
  name: 'VerifyTwoFactorLoginAction',
  description: 'Exchange a LoginAction 2FA challenge + TOTP code for a real token pack',
  method: 'POST',

  validations: {
    challenge_token: {
      rule: schema.string().min(1),
      message: 'A challenge token is required.',
    },
    code: {
      rule: schema.string().min(6).max(64),
      message: 'Enter the 6-digit code from your authenticator app.',
    },
  },

  async handle(request: RequestInstance) {
    const challengeToken = request.get('challenge_token')
    const code = request.get('code')

    // Carry the "remember me" tier the user chose on step 1 through to the
    // session issued here, so a 2FA account is not silently downgraded to the
    // baseline week. The login page re-sends the checkbox with the TOTP code.
    const expiresInMinutes = sessionExpiryMinutes(request.get('remember'))

    // Single-use: a second attempt with the same challenge token
    // (whether the code was right or wrong) must start over from
    // LoginAction, not retry — mirrors the WebAuthn challenge
    // delete-on-read semantics in passkey.ts (stacksjs/stacks#1866).
    const result = await withTwoFactorChallenge(challengeToken, async (userId) => {
      if (!await verifyTwoFactorCredential(userId, code))
        return null
      return Auth.loginUsingId(userId, { expiresInMinutes })
    })
    if (!result)
      return response.unauthorized('Invalid or expired code - please sign in again.')

    const user = result.user

    return response.json(
      {
        access_token: result.token,
        refresh_token: result.refreshToken,
        token_type: 'Bearer',
        expires_in: result.expiresIn,
        token: result.token,
        user: {
          id: user?.id,
          email: user?.email,
          name: user?.name,
        },
      },
      { status: 200, headers: { 'Set-Cookie': buildAuthCookie(result.token, result.expiresIn) } },
    )
  },
})
