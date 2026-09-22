import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const PARTIALS = join(import.meta.dir, '../../resources/views/partials')
const nav = readFileSync(join(PARTIALS, 'marketing-nav.stx'), 'utf8')
const head = readFileSync(join(PARTIALS, 'marketing-head.stx'), 'utf8')

// Below 900px the desktop links are hidden. Without a phone menu that left
// Features, Use cases, Compare, Pricing, Docs and Sign in unreachable from
// the header, which is how the marketing site shipped.
describe('mobile layout contracts', () => {
  test('the phone menu offers every destination the desktop nav does', () => {
    expect(nav).toContain('<details class="nav-menu">')
    const desktop = nav.match(/<div class="nav-links"[\s\S]*?<div class="nav-right">/)?.[0] ?? ''
    const panel = nav.match(/<div class="nav-menu-panel">([\s\S]*?)<\/details>/)?.[1] ?? ''
    const wanted = new Set([...desktop.matchAll(/(?:to|href)="([^"]+)"/g)].map(match => match[1]))
    expect(wanted.size).toBeGreaterThan(20)
    for (const to of [...wanted, '/login', '/register', '/dashboard'])
      expect(panel).toContain(`"${to}"`)
  })

  test('the phone menu is bounded by the visible viewport and locks the page behind it', () => {
    const panelRule = head.match(/\.nav-menu-panel\s*\{[^}]*\}/)?.[0] ?? ''
    expect(panelRule).toContain('max-height: calc(100dvh - 90px)')
    expect(panelRule).toContain('overflow-y: auto')
    expect(panelRule).toContain('overscroll-behavior: contain')
    const phone = head.slice(head.indexOf('@media (max-width: 900px)'))
    expect(phone).toContain('.nav-menu { display: block; }')
    expect(phone).toContain('body:has(.nav-menu[open]) { overflow: hidden; }')
  })
})
