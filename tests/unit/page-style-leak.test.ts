/**
 * No view declares CSS, and the one sheet they now share is scoped per layout
 * group.
 *
 * ## What this file used to guard, and why it is written differently now
 *
 * A page's own `<style>` had to sit inside that page's `<main>`. `<main>` is
 * the router's container -- it swaps the span from the first `<main>` to the
 * last `</main>` -- so a block inside it lived exactly as long as the page
 * did, and a block above or below it stayed in the document forever. statushq
 * has no `@stack('styles')` and stx does not relocate an orphan `<style>`
 * here; it renders exactly where the source puts it.
 *
 * The whole dashboard is one layout group (layouts/default.stx contributes no
 * markup, so every page under it swaps into every other), which is what made
 * it bite. Measured on the served pages 2026-10-13: entering on
 * /dashboard/settings/cloud and clicking to /dashboard/settings/notifications
 * -- a real fragment swap, the navigation entry still naming /cloud -- left
 * its 1,270-char block live, and a fresh `<div class="cloud-form">` appended
 * to the notifications page still computed `display: grid; gap: 17.6px`.
 *
 * Every one of those blocks is a `preflights` entry in config/crosswind.ts
 * now (rule 3 / §11.1), which is the arrangement that ends the question: the
 * generated sheet is the one tag the router treats as durable, so nothing
 * outlives anything. The collisions the old note named did not vanish with
 * them, though -- `.chan-ico` in two pages, `.mon-chart` and `.mon-legend` in
 * three -- because those pages share a group and now share a sheet. They are
 * declared once there, and sites/[slug]'s different `.mon-legend` is
 * `.site-legend`.
 */
import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import theme from '../../config/crosswind'

const ROOT = join(import.meta.dir, '../..')
const VIEWS = join(ROOT, 'resources/views')

const ENTRIES = ((theme as { preflights?: { getCSS: () => string }[] }).preflights ?? [])
  .map(entry => entry.getCSS())
const PREFLIGHT = ENTRIES.join('\n')

function stxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory())
      return stxFiles(path)
    return path.endsWith('.stx') ? [path] : []
  })
}

/** Blank comments so prose about `<style>` is not read as markup. */
function blank(src: string): string {
  return src.replace(/\{\{--[\s\S]*?--\}\}/g, m => ' '.repeat(m.length))
}

describe('page style leak', () => {
  test('§11.1: not one .stx file under resources/ declares CSS', () => {
    const offenders = stxFiles(join(ROOT, 'resources'))
      .filter(path => /<style[\s>]/.test(blank(readFileSync(path, 'utf8'))))
      .map(path => path.slice(ROOT.length + 1))
    expect(offenders).toEqual([])
  })

  test('the invite page still keeps its layout off body', () => {
    /*
     * This view is alone in needing saying, and the move made it matter more
     * rather than less. It has no layout, so it shares the group `default`
     * with every dashboard page -- and now the same sheet. Its block used to
     * put `min-height`, `display: grid`, `place-items` and `padding` on
     * `body`: four properties the dashboard's own body rule never sets, so
     * source order would not have decided it and both would simply have
     * applied. They are on its `<main>`, which is where a page's own layout
     * belongs and is inside the container the router swaps.
     */
    const pages = ENTRIES.find(entry => entry.includes('/* ---- invite/[uuid].stx ---- */')) ?? ''
    expect(pages).not.toBe('')
    const invite = pages.slice(pages.indexOf('/* ---- invite/[uuid].stx ---- */'))
    const body = /(?:^|\n)\s*body:has\(main\.invite-shell\) \{([^}]*)\}/.exec(invite)
    expect(body).not.toBeNull()
    for (const prop of ['display', 'place-items', 'padding', 'min-height'])
      expect(`${prop} on body: ${body![1].includes(prop)}`).toBe(`${prop} on body: false`)

    /*
     * And on `main.invite-shell`, not `main`. Putting it on the element was
     * enough while this block shipped on this page alone; in one shared sheet
     * a bare `main` is the same bug one element down, and it did grid-centre
     * every dashboard page's <main> until the class went on.
     */
    expect(invite).toMatch(/(?:^|\n)\s*main\.invite-shell \{[^}]*place-items: center/)
    expect(invite).not.toMatch(/(?:^|\n)\s*main \{/)
    const view = readFileSync(join(VIEWS, 'invite/[uuid].stx'), 'utf8')
    expect(view).toContain('<main class="invite-shell">')

    /*
     * The dashboard sheet's own body rule reaches this page -- same group --
     * and sets a 15px base this page never had, so it restates 16px. That
     * restatement has to be qualified too: a bare `body` here is later in the
     * sheet than the dashboard's and won on order, resizing every dashboard
     * page. Three things leaked out of this one page before the qualifiers
     * went on, and the browser caught all three; the reading caught none.
     */
    expect(invite).toContain('body:has(main.invite-shell) { font-size: 16px; }')
    expect(invite).not.toMatch(/(?:^|\n)\s*body \{/)
  })

  test('nothing in the shared dashboard sheet is rooted at a bare body or main', () => {
    // The invariant the three leaks above are instances of. Everything in
    // this entry reaches more than one page now, so an element selector at or
    // above the page's own container has to say which page it means.
    const pages = ENTRIES.find(entry => entry.includes('/* ---- invite/[uuid].stx ---- */')) ?? ''
    for (const selector of [/(?:^|\n)\s*body \{/, /(?:^|\n)\s*main \{/, /(?:^|\n)\s*html \{/])
      expect({ selector: String(selector), found: selector.test(pages) }).toEqual({ selector: String(selector), found: false })
  })

  test('the names two pages both declared are declared once', () => {
    /*
     * While each block shipped only on its own page, two pages could give one
     * name two meanings and nothing collided. In one sheet they do, so these
     * were checked rule by rule rather than by name: `.chan-ico` was
     * byte-identical in monitors/[id] and settings/notifications, `.mon-chart`
     * in three pages, and `.mon-legend` in two of those three -- the third had
     * its own and is `.site-legend` now.
     */
    const pages = ENTRIES.find(entry => entry.includes('.chan-ico')) ?? ''
    for (const name of ['chan-ico', 'mon-chart', 'mon-legend', 'site-legend']) {
      // Rule heads only: `.chan-ico {` counts, `.chan-ico svg {` does not.
      const count = [...pages.matchAll(new RegExp(`\\.${name}\\s*\\{`, 'g'))].length
      expect({ name, declarations: count }).toEqual({ name, declarations: 1 })
    }
    // And the markup followed the rename.
    const slug = readFileSync(join(VIEWS, 'dashboard/sites/[slug].stx'), 'utf8')
    expect(slug).toContain('class="site-legend"')
    expect(slug).not.toMatch(/class="[^"]*\bmon-legend\b/)
  })

  test('the names that look shared but never were stay as they are', () => {
    // Every use is qualified by an ancestor or compounded, so none of these
    // three was ever a collision and none needed renaming.
    for (const selector of ['.alert-foot .help', '.cloud-form .help', '.invite-card .help', '.cloud-status.ok', '.pk-msg.ok', '.range-tool.is-active', '.team-switch-item.is-active'])
      expect({ selector, present: PREFLIGHT.includes(selector) }).toEqual({ selector, present: true })
    // The bare forms belong to the dashboard sheet alone.
    expect(PREFLIGHT).toMatch(/\n\s*\.help \{/)
  })
})
