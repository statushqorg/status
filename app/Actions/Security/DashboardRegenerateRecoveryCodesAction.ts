import { Action } from '@stacksjs/actions'
import { regenerateTwoFactorRecoveryCodes, resolveAuthenticatedUser } from '@stacksjs/auth'
import { response } from '@stacksjs/router'
import { backWithError, NO_STORE, recoveryCodesDocument, wantsDocument } from '../../lib/recoveryCodesFallback'

/**
 * `POST /security-forms/two-factor/recovery-codes` - replaces the account's
 * recovery codes with a new set, from the Security settings page.
 *
 * A session alone is not enough: `regenerateTwoFactorRecoveryCodes` wants
 * fresh proof of the second factor (a current authenticator code or one of the
 * existing recovery codes), so a hijacked session cannot mint itself a way
 * past two-factor. Wrong proof changes nothing: the old codes stay valid. The
 * framework counts it against the same lockout as a failed sign-in code, which
 * is where the 429 below comes from.
 *
 * Like the enable action it answers JSON with `no-store`: the new codes are in
 * plaintext only in this response, and only their hashes are stored.
 */

export default new Action({
  name: 'DashboardRegenerateRecoveryCodesAction',
  description: 'Replace the two-factor recovery codes, given a current authenticator or recovery code',

  async handle(request) {
    const user = await resolveAuthenticatedUser(request)
    if (!user)
      return response.unauthorized('Authentication required')

    // A browser that submitted the form itself (scripts off) gets a document
    // and redirects; the page's fetch gets JSON. See recoveryCodesFallback.
    const asDocument = wantsDocument(request)

    // The same bounds the sign-in action puts on a code: six digits, or a
    // recovery code with or without its separators.
    const code = String(request.get('code') ?? '').trim()
    if (code.length < 6 || code.length > 64) {
      if (asDocument)
        return backWithError('bad_recovery_proof')
      return response.json({ error: 'Enter a 6-digit authenticator code or one of your recovery codes.' }, { status: 422, headers: NO_STORE })
    }

    let recoveryCodes: string[] | null
    try {
      recoveryCodes = await regenerateTwoFactorRecoveryCodes(user.id, code)
    }
    catch (error) {
      if ((error as { status?: number } | null)?.status !== 429)
        throw error
      if (asDocument)
        return backWithError('recovery_locked')
      return response.json({ error: 'Too many wrong codes. Wait 15 minutes and try again.' }, { status: 429, headers: NO_STORE })
    }

    if (!recoveryCodes) {
      if (asDocument)
        return backWithError('bad_recovery_proof')
      return response.json({ error: 'That code did not match. Your current recovery codes still work.' }, { status: 422, headers: NO_STORE })
    }

    if (asDocument) {
      return recoveryCodesDocument(recoveryCodes, {
        heading: 'New recovery codes',
        intro: 'These replace every code you had before. The old ones no longer work.',
        done: '/dashboard/settings/security?recovery=regenerated',
      })
    }

    return response.json({ recoveryCodes }, { headers: NO_STORE })
  },
})
