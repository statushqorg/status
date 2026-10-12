/**
 * The contextual link row on a monitor's page.
 *
 * It carried `aria-label="Breadcrumb"` for a long time and is not one. A
 * breadcrumb is a hierarchy ending at the page you are on: the last item is the
 * current page and is not a link. This is a row of SIBLING destinations - the
 * site the monitor belongs to, the monitor index, and the server it runs on
 * when there is one. Every item is a link and none of them is this page, so the
 * old label promised a screen reader user a structure that was not there.
 *
 * Measured in Chrome's accessibility tree before changing it: the leading arrow
 * was part of the first link's accessible name, which came out as
 * `link "← status.acme.test"`. With the arrow hidden it is
 * `link "status.acme.test"`. The middots between the links were read too.
 *
 * These assertions are on the rendered markup rather than on a screenshot
 * because none of it is visible: a wrong label, a decorative glyph inside a
 * link name and a separator in the reading order all look completely fine.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { processDirectives } from '@stacksjs/stx/process'

const viewPath = join(import.meta.dir, '../../resources/views/dashboard/monitors/[id].stx')
const source = readFileSync(viewPath, 'utf8')

// Taken from the real view so the test cannot drift from the file it describes.
const navLine = source.split('\n').find(line => line.includes('<nav class="crumb"'))
if (!navLine)
  throw new Error('The monitor detail contextual nav was not found')

async function render(serverCard: { id: number, name: string } | null) {
  const html = await processDirectives(navLine!, {
    monitorSiteSlug: 'acme',
    monitorSiteHost: 'status.acme.test',
    serverCard,
  }, viewPath, {
    componentsDir: join(import.meta.dir, '../../resources/components'),
    partialsDir: join(import.meta.dir, '../../resources/views/partials'),
  }, new Set())
  // The CSS engine prepends a generated token sheet; the markup is what matters.
  return html.replace(/<style[\s\S]*?<\/style>/g, '').trim()
}

describe('monitor detail contextual nav', () => {
  test('is not announced as a breadcrumb', async () => {
    const html = await render({ id: 7, name: 'edge-01' })
    expect(html).toContain('aria-label="Related pages"')
    expect(html).not.toContain('aria-label="Breadcrumb"')
    // Nothing here is the current page, so nothing may claim to be.
    expect(html).not.toContain('aria-current')
  })

  test('every item stays a link, including the last', async () => {
    const html = await render({ id: 7, name: 'edge-01' })
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map(m => m[1])
    expect(hrefs).toEqual(['/dashboard/sites/acme', '/dashboard/monitors', '/dashboard/servers/7'])
    // The reason this must not become <Breadcrumb>: it would render the last
    // item as a non-link current-page span and break a working link.
    expect(html).toContain('edge-01</a>')
  })

  test('the arrow and the separators are hidden from assistive tech', async () => {
    const html = await render({ id: 7, name: 'edge-01' })
    expect(html).toContain('<span aria-hidden="true">&larr;</span>')
    expect((html.match(/<span aria-hidden="true">&middot;<\/span>/g) ?? []).length).toBe(2)
    // The arrow belongs to the link but not to its accessible name, so it must
    // sit INSIDE the anchor and still be hidden.
    expect(html).toMatch(/<a [^>]*href="\/dashboard\/sites\/acme"[^>]*><span aria-hidden="true">&larr;<\/span> status\.acme\.test<\/a>/)
  })

  test('a monitor with no server drops that link and its separator', async () => {
    const html = await render(null)
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map(m => m[1])
    expect(hrefs).toEqual(['/dashboard/sites/acme', '/dashboard/monitors'])
    expect((html.match(/<span aria-hidden="true">&middot;<\/span>/g) ?? []).length).toBe(1)
  })
})
