import { appOrigin } from './service'

/**
 * Is this request's `Origin` one of ours?
 *
 * A guard for a cookie-authenticated POST whose effect is worth forging: a
 * browser attaches `Origin` to every cross-site POST, so refusing the ones
 * that are not ours stops a third-party page driving the endpoint with the
 * visitor's session. A request with no `Origin` at all is let through, because
 * that is what a server to server call and curl look like, and the endpoint
 * behind this still requires a session.
 *
 * Compared against configuration and not the Host header: behind the proxy the
 * app sees the upstream's host, never the public one. `www.` is accepted
 * alongside the bare host, since an `Origin` can carry either form.
 */
export function sameOrigin(headers: { get?: (name: string) => string | null } | undefined, configured: string = appOrigin()): boolean {
  const origin = headers?.get?.('origin')
  if (!origin)
    return true

  let originHost: string
  let host: string
  try {
    originHost = new URL(origin).host
    host = new URL(configured).host
  }
  catch {
    // A malformed Origin is not something any browser of ours sent, and with
    // nothing configured to compare against nobody is accepted.
    return false
  }
  const bare = host.startsWith('www.') ? host.slice(4) : host
  return originHost === bare || originHost === `www.${bare}`
}
