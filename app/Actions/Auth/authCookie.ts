import process from 'node:process'
import { config } from '@stacksjs/config'

/**
 * Build the `Set-Cookie` header value that mirrors an issued bearer token
 * into an HttpOnly cookie. The SPA's `useAuth` composable only stores the
 * bearer in localStorage, which is invisible during server-side rendering —
 * the dashboard's `.stx` pages (rendered directly from SQLite, no client
 * hydration) resolve "who's logged in" from this cookie instead.
 *
 * Shared by every auth action that mints a session (LoginAction,
 * RegisterAction, VerifyTwoFactorLoginAction) so the cookie contract stays
 * identical across all three entry points into an authenticated session.
 */
export function buildAuthCookie(token: string, expiresInSeconds?: number): string {
  const name = config.auth?.defaultTokenName || 'auth-token'
  const maxAge = Math.max(1, Math.floor(expiresInSeconds ?? (config.auth?.tokenExpiry ?? 60 * 60 * 1000) / 1000))
  const env = (process.env.APP_ENV ?? process.env.NODE_ENV ?? '').toLowerCase()
  const isLocal = env === '' || env === 'local' || env === 'development' || env === 'dev' || env === 'test' || env === 'testing'

  const parts = [`${name}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`]
  if (!isLocal)
    parts.push('Secure')

  return parts.join('; ')
}

/**
 * Clear the auth cookie {@link buildAuthCookie} sets — used by LogoutAction.
 */
export function clearAuthCookie(): string {
  const name = config.auth?.defaultTokenName || 'auth-token'
  return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
}

/** Baseline session: a week. */
const WEEK_MINUTES = 7 * 24 * 60
/** "Keep me signed in": a month. */
const MONTH_MINUTES = 30 * 24 * 60

/**
 * Session length for a fresh login, in minutes, from the login form's
 * "remember me" checkbox. Passed to `Auth.loginUsingId(id, { expiresInMinutes })`,
 * which stamps BOTH the `oauth_access_tokens.expires_at` row and (via the
 * returned `expiresIn`) the cookie's Max-Age from the same number — so the
 * whole session, not just the cookie, honours the tier. Nothing extends either
 * value afterwards (getUserFromToken leaves expires_at alone), so this is the
 * real session cap.
 *
 * Unchecked is the baseline week; checked is 30 days. Accepts whatever the JSON
 * body carries for `remember` — boolean true, or '1'/'true'/'on'/'yes'.
 */
export function sessionExpiryMinutes(remember: unknown): number {
  const on = remember === true
    || ['1', 'true', 'on', 'yes'].includes(String(remember ?? '').toLowerCase())
  return on ? MONTH_MINUTES : WEEK_MINUTES
}
