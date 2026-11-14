import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Auth, createTwoFactorChallenge, disableTwoFactor, generateTwoFactorToken, getTwoFactorState, remainingTwoFactorRecoveryCodes } from '@stacksjs/auth'
import { db } from '@stacksjs/database'
import { featureTest } from '@stacksjs/testing'
import User from '../../app/Models/User'

// See monitor-crud.test.ts's TEAM_ID comment — each feature test file
// isolates its fixtures under its own team_id / email namespace.
const TEAM_ID = 90007
const OWNER_EMAIL = 'security-owner-90007@example.com'
const OTHER_EMAIL = 'security-other-90007@example.com'
const PASSWORD = 'a-real-password-1'

describe('Security settings backend (stacksjs/status#1 Phase 9 follow-up)', () => {
  let ownerId: number
  let otherId: number
  let ownerToken: string
  let otherToken: string

  beforeAll(async () => {
    // Created through the model so the set.password mutator bcrypt-hashes
    // it — DisableTwoFactorAction and /api/login re-verify the password
    // via Auth.validate, which a raw-insert placeholder can never pass.
    const owner = await User.create({ name: 'Security Owner', email: OWNER_EMAIL, password: PASSWORD })
    const other = await User.create({ name: 'Security Other', email: OTHER_EMAIL, password: PASSWORD })
    ownerId = owner.id
    otherId = other.id

    await db.insertInto('teams').values({ id: TEAM_ID, name: 'Security test team' }).execute()
    await db.insertInto('team_members').values({ team_id: TEAM_ID, user_id: ownerId, role: 'owner', status: 'active', invited_email: OWNER_EMAIL }).execute()

    ownerToken = String((await Auth.loginUsingId(ownerId, { withRefreshToken: false }))!.token)
    otherToken = String((await Auth.loginUsingId(otherId, { withRefreshToken: false }))!.token)
  })

  afterAll(async () => {
    // Children before parents. team_members.user_id references users.id, so
    // deleting the user first fails the foreign key, aborts the rest of this
    // block, and leaves the fixture rows behind -- which then collides on
    // users.email the next time this file runs. A teardown that throws poisons
    // every later run, so the ordering here is load-bearing.
    await db.deleteFrom('team_members').where('team_id', '=', TEAM_ID).execute()
    for (const userId of [ownerId, otherId]) {
      await db.deleteFrom('oauth_access_tokens').where('user_id', '=', userId).execute()
      await db.deleteFrom('two_factor_pending_secrets').where('user_id', '=', userId).execute()
      await db.deleteFrom('two_factor_challenges').where('user_id', '=', userId).execute()
      await db.deleteFrom('two_factor_recovery_codes').where('user_id', '=', userId).execute()
      await db.deleteFrom('passkeys').where('user_id', '=', userId).execute()
      await db.deleteFrom('users').where('id', '=', userId).execute()
    }
    await db.deleteFrom('teams').where('id', '=', TEAM_ID).execute()
  })

  const authed = (token: string) => featureTest().withHeaders({ Authorization: `Bearer ${token}` })
  // Anonymous POSTs (login, 2FA verify) must satisfy the CSRF double-submit
  // check the router injects on every mutation — bearer callers bypass it.
  const anonPost = () => featureTest().withHeaders({ 'x-csrf-token': 'sec-test-csrf-90007', 'cookie': 'X-CSRF-Token=sec-test-csrf-90007' })

  /** What the enable and recovery-codes actions answer with. */
  interface CodesBody { enabled?: boolean, recoveryCodes?: string[], error?: string, reason?: string }

  // Ten codes, each 32 hex characters in four dashed groups.
  const RECOVERY_CODE = /^[a-f0-9]{8}(?:-[a-f0-9]{8}){3}$/

  // Password login for a 2FA account answers with a challenge, never tokens.
  const startLogin = async () => {
    const login = await anonPost().post('/api/login', { email: OWNER_EMAIL, password: PASSWORD })
    expect(login.status).toBe(200)
    const challenge = await login.json<{ requires_two_factor?: boolean, challenge_token?: string, token?: string }>()
    expect(challenge.requires_two_factor).toBe(true)
    expect(challenge.challenge_token).toBeTruthy()
    expect(challenge.token).toBeFalsy()
    return challenge
  }

  // Second step of sign-in with whatever code is given. A challenge is
  // single-use, so each call needs a new one; it is issued directly rather
  // than through /api/login, which allows five requests a minute and is
  // exercised for real by the form-flow test below.
  const signInWith = async (code: string) => {
    const verify = await anonPost().post('/api/verify-two-factor-login', {
      challenge_token: await createTwoFactorChallenge(ownerId),
      code,
    })
    if (verify.status === 200) {
      const { token } = await verify.json<{ token?: string }>()
      try { await db.deleteFrom('oauth_access_tokens').where('token', '=', String(token).split('|').pop()).execute() }
      catch {}
    }
    return verify.status
  }

  // A TOTP code is single-use per 30 second step (users.two_factor_last_used_step).
  // Moving the claimed step back is the state the account is in half a minute
  // later, without the test waiting out the clock.
  const freshTotp = async (secret: string) => {
    const claimed = await db.selectFrom('users').where('id', '=', ownerId).select(['two_factor_last_used_step']).executeTakeFirst() as { two_factor_last_used_step: number | string | null }
    expect(claimed.two_factor_last_used_step).not.toBeNull()
    await db.updateTable('users').set({ two_factor_last_used_step: Number(claimed.two_factor_last_used_step) - 2 }).where('id', '=', ownerId).execute()
    return generateTwoFactorToken(secret)
  }

  /** Start setup and confirm it through the dashboard action. */
  const enableOwner = async () => {
    const setup = await authed(ownerToken).post('/generate-two-factor-secret', {})
    const { secret } = await setup.json<{ secret: string }>()
    const code = await generateTwoFactorToken(secret)
    const enable = await authed(ownerToken).post('/api/security-forms/two-factor/enable', { code })
    return { secret, code, enable }
  }

  test('the 2FA setup endpoint rejects anonymous callers', async () => {
    const res = await featureTest().post('/generate-two-factor-secret', {})
    expect(res.status).toBe(401)
  })

  // Regression test for the app Auth middleware not stamping
  // request._authenticatedUser: every framework 2FA action reads
  // `await request.user()` and 401'd on valid bearers before the fix.
  test('a valid bearer reaches the framework 2FA actions as an authenticated user', async () => {
    const res = await authed(ownerToken).post('/generate-two-factor-secret', {})
    expect(res.status).toBe(200)

    const body = await res.json<{ secret: string, uri: string }>()
    expect(body.secret).toBeTruthy()
    expect(body.uri).toContain('otpauth://totp/')
  })

  test('the dashboard form flow enables, challenges at login, and disables TOTP', async () => {
    // Fresh setup through the JSON endpoint (same stash the security.stx
    // ?setup=1 step writes) — the form action must confirm against it.
    const { secret, code, enable } = await enableOwner()

    // Enabling answers JSON, not a redirect: the body is the one place the
    // recovery codes are ever in plaintext, so it must not be cacheable.
    expect(enable.status).toBe(200)
    expect(enable.headers.get('Location')).toBeNull()
    expect(enable.headers.get('Cache-Control')).toBe('private, no-store')
    const enabled = await enable.json<CodesBody>()
    expect(enabled.enabled).toBe(true)
    expect(enabled.recoveryCodes).toHaveLength(10)
    expect(new Set(enabled.recoveryCodes).size).toBe(10)
    for (const recoveryCode of enabled.recoveryCodes!)
      expect(recoveryCode).toMatch(RECOVERY_CODE)
    expect((await getTwoFactorState(ownerId)).enabled).toBe(true)
    expect(await remainingTwoFactorRecoveryCodes(ownerId)).toBe(10)

    // Only hashes are stored: no row holds a code as it was handed out, with
    // or without its dashes.
    const stored = JSON.stringify(await db.selectFrom('two_factor_recovery_codes').where('user_id', '=', ownerId).selectAll().execute())
    for (const recoveryCode of enabled.recoveryCodes!) {
      expect(stored).not.toContain(recoveryCode)
      expect(stored).not.toContain(recoveryCode.replaceAll('-', ''))
    }

    // A second confirmation cannot mint a second set of codes.
    const again = await authed(ownerToken).post('/api/security-forms/two-factor/enable', { code })
    expect(again.status).toBe(422)
    const refused = await again.json<CodesBody>()
    expect(refused.reason).toBe('already_enabled')
    expect(refused.recoveryCodes).toBeUndefined()

    // A TOTP code is single-use: enabling claimed the current 30 second step
    // (users.two_factor_last_used_step), so the code that enrolled the device
    // cannot also sign in. Presenting that same code again is refused
    // rather than replayed.
    const replayed = await anonPost().post('/api/verify-two-factor-login', {
      challenge_token: (await startLogin()).challenge_token,
      code,
    })
    expect(replayed.status).toBe(401)

    // ...and a fresh challenge + a fresh code completes it with a token pack.
    const challenge = await startLogin()
    const verify = await anonPost().post('/api/verify-two-factor-login', {
      challenge_token: challenge.challenge_token,
      code: await freshTotp(secret),
    })
    expect(verify.status).toBe(200)
    const verified = await verify.json<{ token?: string, user?: { id: number } }>()
    expect(verified.token).toBeTruthy()
    expect(verified.user?.id).toBe(ownerId)
    try { await db.deleteFrom('oauth_access_tokens').where('token', '=', String(verified.token).split('|').pop()).execute() }
    catch {}

    // Wrong password cannot disable it.
    const badDisable = await authed(ownerToken).post('/api/security-forms/two-factor/disable', { password: 'not-the-password' })
    expect(badDisable.status).toBe(302)
    expect(badDisable.headers.get('Location')).toBe('/dashboard/settings/security?error=bad_password')
    expect((await getTwoFactorState(ownerId)).enabled).toBe(true)

    // The real password can.
    const disable = await authed(ownerToken).post('/api/security-forms/two-factor/disable', { password: PASSWORD })
    expect(disable.status).toBe(302)
    expect(disable.headers.get('Location')).toBe('/dashboard/settings/security?twofa=disabled')
    expect((await getTwoFactorState(ownerId)).enabled).toBe(false)

    // Turning the factor off takes its recovery codes with it.
    expect(await remainingTwoFactorRecoveryCodes(ownerId)).toBe(0)
    expect(await db.selectFrom('two_factor_recovery_codes').where('user_id', '=', ownerId).execute()).toHaveLength(0)
  })

  test('an expired or missing setup stash is refused as expired instead of enabling', async () => {
    await db.deleteFrom('two_factor_pending_secrets').where('user_id', '=', ownerId).execute()
    const res = await authed(ownerToken).post('/api/security-forms/two-factor/enable', { code: '123456' })
    expect(res.status).toBe(422)
    const body = await res.json<CodesBody>()
    expect(body.reason).toBe('missing')
    expect(body.error).toContain('expired')
    expect(body.recoveryCodes).toBeUndefined()
    expect((await getTwoFactorState(ownerId)).enabled).toBe(false)
  })

  test('a wrong setup code enables nothing, returns no codes, and leaves the same secret usable', async () => {
    const setup = await authed(ownerToken).post('/generate-two-factor-secret', {})
    const { secret } = await setup.json<{ secret: string }>()
    const right = await generateTwoFactorToken(secret)
    // Guaranteed not to be the current code; the odds of it being a
    // neighbouring step's are one in a million.
    const wrong = String((Number(right) + 500000) % 1000000).padStart(6, '0')

    for (const code of [wrong, 'abcdef', '']) {
      const res = await authed(ownerToken).post('/api/security-forms/two-factor/enable', { code })
      expect(res.status).toBe(422)
      expect(res.headers.get('Cache-Control')).toBe('private, no-store')
      const body = await res.json<CodesBody>()
      expect(body.reason).toBe('invalid')
      expect(body.error).toBeTruthy()
      expect(body.recoveryCodes).toBeUndefined()
    }
    expect((await getTwoFactorState(ownerId)).enabled).toBe(false)
    expect(await db.selectFrom('two_factor_recovery_codes').where('user_id', '=', ownerId).execute()).toHaveLength(0)

    // A typo does not cost the person their QR scan: the right code for the
    // same secret still confirms.
    const res = await authed(ownerToken).post('/api/security-forms/two-factor/enable', { code: right })
    expect(res.status).toBe(200)
    expect((await res.json<CodesBody>()).recoveryCodes).toHaveLength(10)

    await disableTwoFactor(ownerId)
  })

  describe('recovery codes', () => {
    let secret: string
    let codes: string[]

    beforeAll(async () => {
      const { secret: enrolled, enable } = await enableOwner()
      expect(enable.status).toBe(200)
      secret = enrolled
      codes = (await enable.json<CodesBody>()).recoveryCodes!
    })

    afterAll(async () => {
      await disableTwoFactor(ownerId)
    })

    const regenerate = (code: string) => authed(ownerToken).post('/api/security-forms/two-factor/recovery-codes', { code })

    test('a recovery code signs in once, is refused the second time, and lowers the remaining count', async () => {
      expect(await remainingTwoFactorRecoveryCodes(ownerId)).toBe(10)

      expect(await signInWith(codes[0]!)).toBe(200)
      expect(await remainingTwoFactorRecoveryCodes(ownerId)).toBe(9)

      expect(await signInWith(codes[0]!)).toBe(401)
      expect(await remainingTwoFactorRecoveryCodes(ownerId)).toBe(9)
    })

    test('a recovery code typed without its dashes, in capitals, still signs in', async () => {
      expect(await signInWith(codes[1]!.replaceAll('-', '').toUpperCase())).toBe(200)
      expect(await remainingTwoFactorRecoveryCodes(ownerId)).toBe(8)
    })

    test('regenerating with wrong proof is refused and the old codes still work', async () => {
      // Well formed, never issued.
      const res = await regenerate('00000000-00000000-00000000-00000000')
      expect(res.status).toBe(422)
      expect(res.headers.get('Cache-Control')).toBe('private, no-store')
      const body = await res.json<CodesBody>()
      expect(body.error).toBeTruthy()
      expect(body.recoveryCodes).toBeUndefined()

      // Too short to be either kind of code: refused before it is checked.
      expect((await regenerate('123')).status).toBe(422)

      expect(await remainingTwoFactorRecoveryCodes(ownerId)).toBe(8)
      expect(await signInWith(codes[2]!)).toBe(200)
      expect(await remainingTwoFactorRecoveryCodes(ownerId)).toBe(7)
    })

    test('regenerating with a current authenticator code returns a new set and retires the old one', async () => {
      const res = await regenerate(await freshTotp(secret))
      expect(res.status).toBe(200)
      expect(res.headers.get('Cache-Control')).toBe('private, no-store')
      const fresh = (await res.json<CodesBody>()).recoveryCodes!
      expect(fresh).toHaveLength(10)
      for (const recoveryCode of fresh) {
        expect(recoveryCode).toMatch(RECOVERY_CODE)
        expect(codes).not.toContain(recoveryCode)
      }
      expect(await remainingTwoFactorRecoveryCodes(ownerId)).toBe(10)

      // An unused code from the old set is dead; one from the new set works.
      expect(await signInWith(codes[3]!)).toBe(401)
      expect(await signInWith(fresh[0]!)).toBe(200)
      expect(await remainingTwoFactorRecoveryCodes(ownerId)).toBe(9)

      codes = fresh
    })

    test('a recovery code is proof enough to regenerate, and is spent by it', async () => {
      const res = await regenerate(codes[1]!)
      expect(res.status).toBe(200)
      const fresh = (await res.json<CodesBody>()).recoveryCodes!
      expect(fresh).toHaveLength(10)
      expect(fresh).not.toContain(codes[1]!)
      expect(await remainingTwoFactorRecoveryCodes(ownerId)).toBe(10)

      // Spent as proof, and retired with the rest of its set either way.
      expect((await regenerate(codes[1]!)).status).toBe(422)
      expect(await remainingTwoFactorRecoveryCodes(ownerId)).toBe(10)
    })

    test('an account without two-factor cannot be issued recovery codes', async () => {
      const res = await authed(otherToken).post('/api/security-forms/two-factor/recovery-codes', { code: '123456' })
      expect(res.status).toBe(422)
      expect((await res.json<CodesBody>()).recoveryCodes).toBeUndefined()
      expect(await db.selectFrom('two_factor_recovery_codes').where('user_id', '=', otherId).execute()).toHaveLength(0)
    })
  })

  test('passkey deletion is scoped to the credential owner', async () => {
    await db.insertInto('passkeys').values({
      id: 'security-test-cred-90007',
      cred_public_key: 'test-public-key',
      user_id: ownerId,
      webauthn_user_id: OWNER_EMAIL,
      counter: 0,
    }).execute()

    // Another signed-in user cannot remove it by guessing the id.
    const foreign = await authed(otherToken).post('/api/security-forms/passkeys/delete', { id: 'security-test-cred-90007' })
    expect(foreign.status).toBe(302)
    let rows = await db.selectFrom('passkeys').where('id', '=', 'security-test-cred-90007').execute()
    expect(rows.length).toBe(1)

    // The owner can.
    const own = await authed(ownerToken).post('/api/security-forms/passkeys/delete', { id: 'security-test-cred-90007' })
    expect(own.status).toBe(302)
    expect(own.headers.get('Location')).toBe('/dashboard/settings/security?passkey=removed')
    rows = await db.selectFrom('passkeys').where('id', '=', 'security-test-cred-90007').execute()
    expect(rows.length).toBe(0)
  })

  test('the security form actions reject anonymous callers', async () => {
    for (const path of ['/api/security-forms/two-factor/enable', '/api/security-forms/two-factor/recovery-codes', '/api/security-forms/two-factor/disable', '/api/security-forms/passkeys/delete']) {
      const res = await featureTest().withHeaders({ 'x-csrf-token': 'test', 'cookie': 'X-CSRF-Token=test' }).post(path, { code: '123456', password: 'x', id: 'nope' })
      expect(res.status).toBe(401)
    }
  })
})
