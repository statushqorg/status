import { describe, expect, test } from 'bun:test'
import { connectPath, connectReturn, withConnectReturn } from '../../resources/data/connect-return'

/**
 * Signing in during `buddy hq:connect` comes back to the approve page.
 *
 * A signed-out person who opened the approve link used to be sent to sign in,
 * landed where sign-in always lands, and the connect was lost: the terminal
 * waited for a confirmation nobody was asked for.
 */

const CODE = 'T-7-D_wNoBcWEsXJYgHokh4DB4GtngYPGzdFVM11amk'
const APPROVE = `/cli/connect?code=${CODE}`

const source = (path: string): Promise<string> => Bun.file(new URL(`../../${path}`, import.meta.url)).text()

describe('the return to the connect approve page', () => {
  test('is the approve page with its code', () => {
    expect(connectPath(CODE)).toBe(APPROVE)
    expect(connectReturn(APPROVE)).toBe(APPROVE)
    expect(withConnectReturn('/login', CODE)).toBe(`/login?next=${encodeURIComponent(APPROVE)}`)
    expect(withConnectReturn('/register', CODE)).toBe(`/register?next=${encodeURIComponent(APPROVE)}`)
  })

  test('survives the trip through the sign-in link and back', () => {
    const link = new URL(withConnectReturn('/login', CODE), 'https://app.test')
    expect(connectReturn(link.searchParams.get('next'))).toBe(APPROVE)
  })

  test('is nothing for a code that is not one, so the link is the plain page', () => {
    for (const code of [undefined, null, '', 'short', 'bad code', `${CODE}&next=//evil.example`, `${CODE}#x`, 'a'.repeat(129)]) {
      expect(connectPath(code)).toBe('')
      expect(withConnectReturn('/login', code)).toBe('/login')
    }
  })

  test('follows nothing that only looks like the approve page', () => {
    for (const next of [
      undefined, null, '', '/dashboard', '/cli/connect', '/cli/connect?code=short',
      `/cli/connect?code=${CODE}&next=https://evil.example`,
      `https://evil.example/cli/connect?code=${CODE}`,
      `//evil.example/cli/connect?code=${CODE}`,
      `/cli/connect?code=${CODE}#x`,
      `/cli/connect/../login?code=${CODE}`,
      ` /cli/connect?code=${CODE}`,
      `/cli/connect?code=${CODE}\n`,
      'javascript:alert(1)',
    ])
      expect(connectReturn(next)).toBe('')
  })

  test('takes only the first value of a repeated parameter', () => {
    expect(connectReturn([APPROVE, 'https://evil.example'])).toBe(APPROVE)
    expect(connectReturn(['https://evil.example', APPROVE])).toBe('')
  })
})

describe('the pages that carry it', () => {
  test('the approve page sends a signed-out person to sign in and back, in the same tab', async () => {
    const view = await source('resources/views/cli/connect.stx')
    expect(view).toContain('withConnectReturn(\'/login\', code)')
    expect(view).toContain('withConnectReturn(\'/register\', code)')
    expect(view).toContain('href="{{ signInHref }}"')
    expect(view).toContain('href="{{ registerHref }}"')
    // A new tab is how the approve page got left behind.
    expect(view).not.toContain('target="_blank"')
    // No bare sign-in link or redirect is left that would forget the code.
    expect(view).not.toContain('href="/login"')
    expect(view).not.toContain('href="/register"')
    expect(view).not.toContain('navigate(\'/login\'')
  })

  test('sign-in and sign-up go back to it, and nowhere else the address bar names', async () => {
    for (const page of ['resources/views/login.stx', 'resources/views/register.stx']) {
      const view = await source(page)
      expect(view).toContain('import { connectReturn } from \'../data/connect-return\'')
      // Every navigation after a successful sign-in asks for the return first.
      const navigations = view.match(/^\s*navigate\(.*$/gm) ?? []
      expect(navigations.length).toBeGreaterThan(0)
      for (const line of navigations)
        expect(line).toContain('connectReturn(route.query.next) ||')
      // The raw query value is never a destination.
      expect(view).not.toMatch(/navigate\(\s*route\.query/)
    }
  })
})
