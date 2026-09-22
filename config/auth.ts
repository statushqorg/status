import type { AuthConfig } from '@stacksjs/types'
import { env } from '@stacksjs/env'

/**
 * **Authentication Configuration**
 *
 * This configuration defines all of your authentication options. Because Stacks is fully-typed,
 * you may hover any of the options below and the definitions will be provided. In case
 * you have any questions, feel free to reach out via Discord or GitHub Discussions.
 */
export default {
  enabled: true,

  /**
   * The authentication guard to use for your application.
   */
  default: 'api',

  /**
   * The authentication guards available for your application.
   */
  guards: {
    api: {
      driver: 'token',
      provider: 'users',
    },
  },

  /**
   * The authentication providers available for your application.
   */
  providers: {
    users: {
      driver: 'database',
      table: 'users',
    },
  },

  /**
   * The username field used for authentication.
   */
  username: env.AUTH_USERNAME_FIELD || 'email',

  /**
   * The password field used for authentication.
   */
  password: env.AUTH_PASSWORD_FIELD || 'password',

  /**
   * Access-token expiry in milliseconds (default: 7 days).
   *
   * This value IS the browser session length, not just an API-bearer TTL.
   * LoginAction mirrors the issued access token into the HttpOnly
   * `auth-token` cookie (see Actions/Auth/authCookie.ts) because the
   * dashboard is server-rendered stx with no client hydration and has no
   * other way to know who is asking. Both the cookie's Max-Age and the
   * `oauth_access_tokens.expires_at` row are stamped from here, and
   * nothing extends either one — `getUserFromToken` bumps `updated_at` on
   * every request but leaves `expires_at` alone, then deletes the row
   * once it passes. So a signed-in operator is logged out exactly this
   * long after login regardless of activity.
   *
   * This is the BASELINE only. LoginAction and VerifyTwoFactorLoginAction
   * pass a per-login `expiresInMinutes` from the sign-in form's "remember
   * me" checkbox (see sessionExpiryMinutes in Actions/Auth/authCookie.ts):
   * a week unchecked, 30 days checked. This default covers the entry points
   * that have no such checkbox — register, SSO, passkey, invite acceptance
   * — so they all land on the baseline week rather than the old 24h.
   *
   * It was 24h (and 1h before that, a sane API-bearer TTL but a hostile
   * session). A day still meant a forced re-login mid-task every morning;
   * a week baseline with an opt-in month is the "don't log me out" bar the
   * other HQ apps already clear.
   */
  tokenExpiry: env.AUTH_TOKEN_EXPIRY || 7 * 24 * 60 * 60 * 1000,

  /**
   * Refresh-token expiry in milliseconds (default: 30 days).
   *
   * NOT WIRED UP. A refresh token is minted and returned in the login
   * response body by LoginAction, VerifyTwoFactorLoginAction and
   * PasskeyLoginVerifyAction — and consumed by nothing. There is no
   * refresh route in routes/api.ts and no cookie stores it, so the value
   * below only bounds a row in `oauth_refresh_tokens` that never gets
   * read. Session length is `tokenExpiry` above, alone.
   *
   * Building the exchange is awkward here: an stx server block cannot set
   * response headers, so a server-rendered dashboard page has nowhere to
   * rotate the cookie. Anything relying on refresh needs that solved
   * first.
   */
  refreshTokenExpiry: env.AUTH_REFRESH_TOKEN_EXPIRY || 30 * 24 * 60 * 60 * 1000,

  /**
   * The token rotation time in hours (default: 24 hours).
   */
  tokenRotation: env.AUTH_TOKEN_ROTATION || 24,

  /**
   * The token abilities that are granted by default.
   */
  defaultAbilities: ['*'],

  /**
   * The token name used when creating new tokens.
   */
  defaultTokenName: 'auth-token',

  /**
   * Password reset configuration.
   */
  passwordReset: {
    /**
     * Token expiration time in minutes.
     * After this time, the reset link becomes invalid.
     *
     * @default 60
     */
    expire: env.AUTH_PASSWORD_RESET_EXPIRE ||60,

    /**
     * Throttle time in seconds between password reset requests.
     * Users must wait this long before requesting another reset email.
     *
     * @default 60
     */
    throttle: env.AUTH_PASSWORD_RESET_THROTTLE ||60,
  },
} satisfies AuthConfig
