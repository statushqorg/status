/**
 * A page's own CSS must sit inside that page's <main>.
 *
 * <main> is the router's container: it swaps the span from the first <main> to
 * the last </main>, so a <style> inside it lives exactly as long as the page
 * does. statushq has no `@stack('styles')` and stx does not relocate an orphan
 * <style> here -- it renders exactly where the source puts it -- so a block
 * written above or below <main> stays in the document forever.
 *
 * The whole dashboard is one layout group (layouts/default.stx contributes no
 * markup, so every page under it swaps into every other), which is what made
 * this bite. Measured on the served pages 2026-10-13: entering on
 * /dashboard/settings/cloud and clicking to /dashboard/settings/notifications
 * -- a real fragment swap, the navigation entry still naming /cloud -- left its
 * 1,270-char block live, and a fresh `<div class="cloud-form">` appended to the
 * notifications page still computed `display: grid; gap: 17.6px`.
 *
 * Seven views were doing it, and two pairs genuinely collided: `.chan-ico` is
 * declared by both monitors/[id] and settings/notifications, and `.mon-chart` /
 * `.mon-legend` by both servers/[id] and sites/[slug]. Those are not extra
 * rules sitting harmlessly in the document, they are one page's definition
 * applying to another page's elements.
 *
 * Two files are deliberately exempt, both listed below with the reason.
 *
 * Layouts, partials and components are not checked: their blocks belong to
 * every page they are included on, by design rather than by accident of entry.
 */
import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dir, '../..')
const VIEWS = join(ROOT, 'resources/views')

/*
 * index.stx owns its whole document and is alone in layout group 'home', so a
 * move away from it is a full document load and its CSS cannot reach another
 * page. Its block also styles the coming-soon screen, which renders as a
 * SIBLING of the site content rather than inside it.
 *
 * invite/[uuid].stx was the other exemption and is not any more. It had no
 * <main> to put its block in, while sitting in group 'default' alongside the
 * whole dashboard. It has one now, so it is covered by the loop below.
 */
const EXEMPT = ['index.stx']

function views(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry !== 'layouts' && entry !== 'partials')
        out.push(...views(full))
    }
    else if (entry.endsWith('.stx')) {
      out.push(full)
    }
  }
  return out
}

/** Blank comments so prose about <main> is not read as markup. */
function blank(src: string): string {
  return src.replace(/\{\{--[\s\S]*?--\}\}/g, m => ' '.repeat(m.length))
}

describe('page style leak', () => {
  const files = views(VIEWS)
    .map(f => [f.slice(VIEWS.length + 1), readFileSync(f, 'utf8')] as const)
    .filter(([name]) => !EXEMPT.includes(name))

  test('every view with a <style> block declares a <main> to put it in', () => {
    for (const [name, src] of files) {
      const s = blank(src)
      if (!/<style/.test(s))
        continue
      expect(`${name}: ${/<main\b/.test(s)}`).toBe(`${name}: true`)
    }
  })

  test('every view keeps its <style> inside <main>', () => {
    for (const [name, src] of files) {
      const s = blank(src)
      const open = s.search(/<main\b/)
      const close = s.lastIndexOf('</main>')
      for (const m of s.matchAll(/<style/g))
        expect(`${name}@${m.index}: ${m.index! > open && m.index! < close}`).toBe(`${name}@${m.index}: true`)
    }
  })

  test('the exempt list is exactly the one file that cannot comply', () => {
    // A second entry here should be a deliberate act with a reason beside it,
    // not a way to make this file go quiet.
    expect(EXEMPT).toEqual(['index.stx'])
  })

  test('the invite page keeps its layout off body, where it would leak', () => {
    /*
     * This view is alone in needing saying. It has no layout, so it shares the
     * group 'default' with every dashboard page, and its block used to put
     * `min-height`, `display: grid`, `place-items` and `padding` on `body` --
     * four properties the dashboard's own body rule never sets, so source
     * order would not have decided it. They live on its <main> now, which is
     * both where a page's own layout belongs and inside the container the
     * router actually swaps.
     */
    const invite = readFileSync(join(VIEWS, 'invite/[uuid].stx'), 'utf8')
    const body = /(?:^|\n)\s*body \{([^}]*)\}/.exec(invite)
    expect(body).not.toBeNull()
    for (const prop of ['display', 'place-items', 'padding', 'min-height'])
      expect(`${prop} on body: ${body![1].includes(prop)}`).toBe(`${prop} on body: false`)
    expect(invite).toMatch(/(?:^|\n)\s*main \{[^}]*place-items: center/)
  })
})
