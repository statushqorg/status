// The coming-soon preview bypass.
//
// A standalone browser asset, not an stx template: no imports, no stx runtime,
// no composables, loaded with <script src defer> from the view. The DOM calls
// below are marked rather than converted because there is nothing here to
// convert them to -- a useCookie() or navigate() has no runtime to come from,
// and this file has to keep working on a page served while the app is in
// coming-soon mode.
//
// The stx validator resolves <script src> and scans this file, attributing
// what it finds to the view that references it, which is why these markers
// live here and not in index.stx. Marked per call site rather than added to
// allowPatterns: that list is a rule-global substring filter with no file
// scoping, so allowing document.cookie for this asset would stop the
// validator reporting it anywhere in the app.

(() => {
  const body = document.body
  if (!body || body.dataset.siteMode !== 'coming-soon')
    return

  const enabled = body.dataset.comingSoonBypassEnabled === 'true'
  if (!enabled)
    return

  const token = body.dataset.comingSoonBypass || ''
  const expectedValue = token || '1'
  const cookieName = 'stacks_coming_soon_preview'
  // stx-strict-ignore-next-line window.location
  const params = new URLSearchParams(window.location.search)
  const requestedPreview = params.get('preview') || params.get('bypass') || ''

  if (requestedPreview === 'off') {
    // stx-strict-ignore-next-line document.cookie
    document.cookie = `${cookieName}=; Path=/; Max-Age=0; SameSite=Lax`
    return
  }

  if (requestedPreview && requestedPreview === expectedValue) {
    // stx-strict-ignore-next-line document.cookie
    document.cookie = `${cookieName}=${encodeURIComponent(expectedValue)}; Path=/; Max-Age=2592000; SameSite=Lax`
    body.classList.add('site-mode-unlocked')
    // stx-strict-ignore-next-line window.history window.location
    window.history.replaceState({}, '', `${window.location.pathname}${window.location.hash}`)
    return
  }

  const cookies = Object.fromEntries(
    // stx-strict-ignore-next-line document.cookie
    document.cookie
      .split(';')
      .map(cookie => cookie.trim())
      .filter(Boolean)
      .map((cookie) => {
        const index = cookie.indexOf('=')
        if (index === -1)
          return [cookie, '']

        return [cookie.slice(0, index), decodeURIComponent(cookie.slice(index + 1))]
      }),
  )

  if (cookies[cookieName] === expectedValue)
    body.classList.add('site-mode-unlocked')
})()
