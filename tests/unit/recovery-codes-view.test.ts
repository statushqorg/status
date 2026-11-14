import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Three things about the recovery-code screens that render fine when they are
 * wrong, so only reading the source catches them. These pages are behind a
 * sign-in (and one behind a second factor), which no render gate reaches.
 */
const VIEWS = join(import.meta.dir, '../../resources/views')
const security = readFileSync(join(VIEWS, 'dashboard/settings/security.stx'), 'utf8')
const login = readFileSync(join(VIEWS, 'login.stx'), 'utf8')

/** The `<script client>` block, comments included. Anchored to a line start: the server block's comments name the tag too. */
function clientScript(source: string): string {
  return source.match(/^<script client>\n([\s\S]*?)^<\/script>/m)?.[1] ?? ''
}

/** The opening tag of the element with this id. */
function tagWithId(source: string, id: string): string {
  return source.match(new RegExp(`<[a-z]+\\b[^>]*\\bid="${id}"[^>]*>`))?.[0] ?? ''
}

describe('security settings view', () => {
  // stx evaluates an @if condition with every `__`-prefixed binding withheld,
  // and an unknown name there is quietly false rather than an error. A
  // condition on `__SETUP` or `__passkeys` therefore renders nothing: that is
  // how the two-factor card came to be empty and the passkey list invisible.
  test('no @if condition reads a `__` binding, which stx would silently treat as false', () => {
    const conditions = [...security.matchAll(/@(?:if|elseif|unless)\s*\(([^\n]*)\)/g)].map(m => m[1]!)
    expect(conditions.length).toBeGreaterThan(5)
    for (const condition of conditions)
      expect(condition, `@if (${condition})`).not.toMatch(/(?<![\w$])__\w/)
  })

  // The plaintext codes may live in a signal and nowhere else.
  test('the client script keeps recovery codes out of storage, cookies, the address and the console', () => {
    const script = clientScript(security)
    expect(script).toContain('rcCodes')
    for (const sink of ['localStorage', 'sessionStorage', 'useLocalStorage', 'useSessionStorage', 'keptState', 'console.', 'csrf.set(rc', 'URLSearchParams'])
      expect(script, sink).not.toContain(sink)
    // Where "I have saved these" goes is fixed text, never built from the codes.
    for (const [, target] of script.matchAll(/'(\/dashboard\/settings\/security[^']*)'/g))
      expect(target).toMatch(/^\/dashboard\/settings\/security(\?(twofa=enabled|recovery=regenerated|passkey=added))?$/)
  })

  test('both code forms answer in place and share one alert', () => {
    expect(security).toMatch(/action="\/api\/security-forms\/two-factor\/enable"[^>]*@submit="confirmSetup"/)
    expect(security).toMatch(/action="\/api\/security-forms\/two-factor\/recovery-codes"[^>]*@submit="regenerateCodes"/)
    expect(tagWithId(security, 'rc-error')).toContain('role="alert"')
    expect(tagWithId(security, 'recovery-proof')).toContain('maxlength="64"')
    expect(tagWithId(security, 'recovery-proof')).toContain('aria-describedby="recovery-proof-help rc-error"')
  })
})

describe('sign-in second step', () => {
  // A recovery code is 32 hex characters in four dashed groups. A field capped
  // at six characters, or one that raises a digits-only keypad, cannot take it.
  test('the code field accepts a recovery code as well as six digits', () => {
    const field = tagWithId(login, 'code')
    expect(field).toContain('maxlength="64"')
    expect(field).toContain('minlength="6"')
    expect(field).not.toContain('inputmode="numeric"')
    expect(field).not.toMatch(/\bpattern=/)
    expect(field).toContain('aria-describedby="code-help error"')
    expect(login).toContain('id="code-help"')
    expect(login).toMatch(/for="code">[^<]*recovery code/i)
  })
})
