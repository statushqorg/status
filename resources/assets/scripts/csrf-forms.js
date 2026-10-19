// CSRF for server-rendered forms (stacksjs/status).
//
// The dashboard's `<form method="POST">` actions authenticate via the
// ambient HttpOnly `auth-token` cookie, so — unlike bearer-token API
// calls, which the CSRF middleware exempts — they need the double-submit
// CSRF token. The token is a stateless nonce (the server only checks that
// the `_token` field equals the `X-CSRF-Token` cookie), and the cookie is
// not HttpOnly, so the client can both read it and mint one when absent.
// Same-origin + SameSite=Lax keep a cross-site attacker from forging a
// matching cookie+field pair.
//
// This runs on every dashboard page: it guarantees the cookie exists and,
// on submit, stamps a fresh `_token` into every same-origin POST form —
// so no individual form template has to thread the token through itself.
//
// ## Why the DOM calls below are marked rather than converted
//
// stx-standards rule 8, §12.1. This is a standalone browser asset, not an stx
// template: no imports, no stx runtime, no composables. useCookie() and
// useEventListener() have no runtime to come from here, and this file must run
// before and independently of one -- it is what guarantees the cookie exists
// on every dashboard page, including pages whose own scripts never load.
//
// Marked per call site rather than added to allowPatterns, which is a
// rule-global substring filter with no file scoping: allowing document.cookie
// for this asset would stop the validator reporting it anywhere in the app.
//
// The markers are defensive rather than currently enforced. This app's stx
// does resolve <script src> and scan the asset behind it -- that is how
// site-mode.js came to be reported, attributed to index.stx, which references
// it directly. This file is pulled in by layouts/default.stx and
// partials/app-head.stx instead, and a view does not inherit its layout's
// script tags for that scan, so it is never looked at: measured by rendering
// a dashboard page carrying three tags for this file and getting silence.
(function () {
  function readCookie(name) {
    // stx-strict-ignore-next-line document.cookie
    const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[.$?*|{}()\[\]\\\/+^]/g, '\\$&') + '=([^;]*)'))
    return m ? decodeURIComponent(m[1]) : null
  }

  function ensureToken() {
    const existing = readCookie('X-CSRF-Token')
    if (existing)
      return existing
    const arr = new Uint8Array(32)
    window.crypto.getRandomValues(arr)
    const tok = Array.prototype.map.call(arr, function (b) { return ('0' + b.toString(16)).slice(-2) }).join('')
    // stx-strict-ignore-next-line document.cookie
    document.cookie = 'X-CSRF-Token=' + tok + '; Path=/; SameSite=Lax' + (location.protocol === 'https:' ? '; Secure' : '')
    return tok
  }

  // Seed on load so the cookie is present well before any submit.
  try { ensureToken() } catch (err) {}

  function stampForm(form) {
    // Only same-origin, state-mutating forms need a token.
    const method = (form.getAttribute('method') || 'get').toLowerCase()
    if (method === 'get')
      return
    const token = ensureToken()
    var field = form.querySelector('input[name="_token"]')
    if (!field) {
      // stx-strict-ignore-next-line document.createElement
      field = document.createElement('input')
      field.type = 'hidden'
      field.name = '_token'
      form.appendChild(field)
    }
    field.value = token
  }

  // Capture-phase submit listener so the field is present before the
  // browser serializes the form (native submits and requestSubmit both
  // fire 'submit' first).
  // stx-strict-ignore-next-line document.addEventListener
  document.addEventListener('submit', function (e) {
    if (e.target && e.target.tagName === 'FORM')
      stampForm(e.target)
  }, true)
})()
