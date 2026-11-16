/**
 * A fixed-window counter for the approve step of a connect (app/Actions/Hq/ApproveConnectAction.ts).
 *
 * The router's own `.rateLimit()` counts by address, which is the right key
 * for the two routes a CLI calls. Approving is different: the confirmation
 * code is six characters, so what has to be bounded is how many guesses one
 * signed-in PERSON gets, from whatever addresses they come. That needs a key
 * the router does not offer, so the count is kept here.
 *
 * In memory, per process. A restart forgets the window, which costs an
 * attacker nothing useful: a connect lives ten minutes and a restart takes
 * longer than a window.
 */

interface Window {
  count: number
  resetAt: number
}

const windows = new Map<string, Window>()
const MAX_KEYS = 10_000

export function rateLimit(key: string, limit: number, windowMs: number, now: number = Date.now()): { ok: boolean, retryAfter: number } {
  const current = windows.get(key)
  if (!current || current.resetAt <= now) {
    // Bounded: expired windows are dropped before the map can grow without end.
    if (windows.size >= MAX_KEYS) {
      for (const [name, window] of windows) {
        if (window.resetAt <= now)
          windows.delete(name)
      }
    }
    windows.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, retryAfter: 0 }
  }
  current.count++
  if (current.count > limit)
    return { ok: false, retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) }
  return { ok: true, retryAfter: 0 }
}
