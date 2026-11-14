/**
 * The two recovery-code actions without JavaScript.
 *
 * The Security page posts both forms with fetch and shows the codes from a
 * signal, so they exist only in that response. A browser with scripts off (or
 * one where the page's script failed to load) submits the same form natively,
 * and a JSON body is then the page: enabling two-factor showed a raw
 * `{"enabled":true,"recoveryCodes":[...]}` to someone who had no way to
 * know what it was, on the one screen they cannot get back to.
 *
 * A native submission is told apart by its Accept header (a form navigation
 * asks for text/html; the page's fetch asks for application/json). It gets the
 * same guarantees in the form a document can carry them: failures redirect
 * back to the page with a code its banner already knows how to word, and the
 * codes are a small standalone document, `no-store`, that links back.
 */

/** Recovery codes in a body must not be kept by a browser or a proxy. */
export const NO_STORE = { 'Cache-Control': 'private, no-store' } as const

const SECURITY_PAGE = '/dashboard/settings/security'

/** True when the caller is a browser navigating, not the page's own fetch. */
export function wantsDocument(request: { headers: { get: (name: string) => string | null } }): boolean {
  const accept = (request.headers.get('accept') ?? '').toLowerCase()
  return accept.includes('text/html') && !accept.includes('application/json')
}

/** Back to the Security page with an error code its banner words. */
export function backWithError(code: string, query = ''): Response {
  const extra = query ? `${query}&` : ''
  return new Response(null, { status: 303, headers: { ...NO_STORE, Location: `${SECURITY_PAGE}?${extra}error=${encodeURIComponent(code)}` } })
}

const escapeHtml = (value: string): string => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')

/**
 * The codes as a document: shown once, never stored, with the way back.
 *
 * Self-contained on purpose. It is reached only when the page's script did not
 * run, so it cannot lean on that script or on a stylesheet the page builds.
 */
export function recoveryCodesDocument(codes: readonly string[], options: { heading: string, intro: string, done: string }): Response {
  const list = codes.map(code => `<li><code>${escapeHtml(code)}</code></li>`).join('')
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(options.heading)} · StatusHQ</title>
<style>
:root { color-scheme: light dark; }
body { margin: 0; padding: 2.5rem 1.25rem; font: 16px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; background: Canvas; color: CanvasText; }
main { max-width: 34rem; margin: 0 auto; }
h1 { margin: 0 0 .5rem; font-size: 1.4rem; line-height: 1.3; }
p { margin: 0 0 1rem; }
ol { margin: 0 0 1.25rem; padding: 1rem 1rem 1rem 2.5rem; border: 1px solid color-mix(in srgb, CanvasText 22%, transparent); border-radius: .6rem; }
code { font: 0.95rem/1.9 ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere; }
a { display: inline-block; padding: .6rem 1rem; border-radius: .5rem; background: CanvasText; color: Canvas; text-decoration: none; font-weight: 600; }
a:focus-visible { outline: 3px solid Highlight; outline-offset: 3px; }
.note { font-size: .9rem; opacity: .8; }
</style>
</head>
<body>
<main>
<h1>${escapeHtml(options.heading)}</h1>
<p>${escapeHtml(options.intro)}</p>
<ol aria-label="Recovery codes">${list}</ol>
<p class="note">This page is shown once. Write the codes down or save them in a password manager before you leave it. Reloading will not bring them back.</p>
<p><a href="${escapeHtml(options.done)}">I have saved these</a></p>
</main>
</body>
</html>`
  return new Response(html, { status: 200, headers: { ...NO_STORE, 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex' } })
}
