/**
 * The design tokens, and the fact that there is now one copy of them.
 *
 * They were declared in FOUR `<style>` blocks -- partials/app-head.stx,
 * partials/marketing-head.stx, layouts/auth.stx and invite/[uuid].stx -- and
 * app-head's own comment asked that they "stay in sync if the brand changes".
 * stx-standards rule 3 / §11.2 puts a custom property in config/crosswind.ts
 * and nowhere else, which is also the only arrangement where that request
 * cannot be forgotten.
 *
 * They had not quite stayed in sync. Diffed value by value rather than read:
 *
 *   app vs marketing   byte-identical but for --violet, marketing-only
 *   auth vs app        every colour equal except light --danger-soft, 0.08
 *                      against 0.09, and six tokens missing entirely
 *                      (--success, --success-soft, --amber, --amber-soft,
 *                      --shadow, --font-mono)
 *   invite vs auth     the same copy again, same drift
 *
 * The rest of what looked like drift was whitespace: `rgba(11,15,13,0.1)`
 * against `rgba(11, 15, 13, 0.1)`.
 */
import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import theme from '../../config/crosswind'
// The installed STX package does not export these subpaths by bare specifier.
import { loadCssEngine } from '../../node_modules/@stacksjs/stx/dist/dev-server/ts-css.js'
import { mergeCssConfig } from '../../node_modules/@stacksjs/stx/dist/ts-css-config.js'

const ROOT = join(import.meta.dir, '../..')
const VIEWS = join(ROOT, 'resources/views')

function stxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory())
      return stxFiles(path)
    return path.endsWith('.stx') ? [path] : []
  })
}

/**
 * The preflight entries, in order. The first is the palette; the rest are the
 * per-layout-group stylesheets, which ARE scoped and are not this file's
 * subject.
 */
const ENTRIES = ((theme as { preflights?: { getCSS: () => string }[] }).preflights ?? [])
  .map(entry => entry.getCSS())
const PREFLIGHT = ENTRIES[0]

/** The whole sheet, merged the way the render path merges it. */
async function generate(): Promise<string> {
  const engine = await loadCssEngine()
  if (!engine)
    throw new Error('The installed STX CSS engine is required')
  const merged = mergeCssConfig(engine.defaultConfig || engine.config, theme)
  return new engine.CSSGenerator(merged.config).toCSS(merged.includePreflight, false)
}

describe('one declaration site', () => {
  test('§11.2: no .stx file declares a design token', () => {
    /*
     * The standard's own check, with one exception that is not a token:
     * layouts/auth.stx binds an inline SVG to each SSO button through
     * `--sso-mask`, which is a per-element value carrying a data: URL, not a
     * value anything else reads. It moves with that block when auth.stx's CSS
     * does; it is listed here so the number is zero rather than "almost".
     */
    const offenders: string[] = []
    for (const path of stxFiles(VIEWS)) {
      const source = readFileSync(path, 'utf8').replace(/\{\{--[\s\S]*?--\}\}/g, '')
      for (const match of source.matchAll(/^[^\n]*?(--[a-z][\w-]*)\s*:/gm)) {
        if (match[1] === '--sso-mask')
          continue
        offenders.push(`${path.slice(VIEWS.length + 1)}: ${match[1]}`)
      }
    }
    expect(offenders).toEqual([])
  })

  test('the config declares exactly one palette, in three rules', () => {
    // Light, the system-preference override, and the explicit [data-theme]
    // one. Order matters: the attribute rule must come after the media query
    // so a reader's choice beats their OS.
    const selectors = [...PREFLIGHT.matchAll(/([^{}\n]+)\{/g)].map(m => m[1].trim()).filter(Boolean)
    expect(selectors).toEqual([
      ':root',
      '@media (prefers-color-scheme: dark)',
      'html:not([data-theme="light"])',
      'html[data-theme="dark"]',
    ])
    expect(PREFLIGHT.indexOf('html[data-theme="dark"]')).toBeGreaterThan(PREFLIGHT.indexOf('prefers-color-scheme'))
  })

  test('it is the superset of the four copies, not any one of them', async () => {
    const css = await generate()
    // --violet was marketing's alone.
    expect(css).toContain('--violet: #6d5efc')
    expect(css).toContain('--violet: #a196ff')
    // The six auth and invite lacked.
    for (const token of ['--success:', '--success-soft:', '--amber:', '--amber-soft:', '--shadow:', '--font-mono:'])
      expect({ token, present: css.includes(token) }).toEqual({ token, present: true })
    // The one real value difference, resolved in favour of app/marketing.
    expect(css).toContain('--danger-soft: rgba(220, 38, 38, 0.09)')
    expect(css).not.toContain('rgba(220,38,38,0.08)')
  })

  test('every name theme.extend maps actually exists in the palette', () => {
    /*
     * The two halves of this file have to agree: `theme.extend.colors` maps
     * utility names onto `var(--x)`, and those vars are declared above. A
     * mapping onto a token the palette does not have resolves to nothing, and
     * reads at the call site as a utility that simply did not apply.
     */
    const declared = new Set([...PREFLIGHT.matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1]))
    const referenced = new Set<string>()
    for (const group of [theme.theme.extend.colors, theme.theme.extend.borderRadius, theme.theme.extend.fontFamily]) {
      for (const value of Object.values(group as Record<string, unknown>)) {
        for (const match of JSON.stringify(value).matchAll(/var\((--[\w-]+)/g))
          referenced.add(match[1])
      }
    }
    expect([...referenced].filter(name => !declared.has(name)).sort()).toEqual([])
  })
})

describe('the tokens reach every layout group', () => {
  test('the palette is unscoped, because there is only one of it', async () => {
    /*
     * The chrome that reads these is scoped per layout group -- the dashboard
     * and the marketing site give `.button` and `.panel` different meanings --
     * but the palette is not, and should not be. Four copies that were meant
     * to be identical is the evidence for that, not an argument against it.
     */
    expect(PREFLIGHT).not.toContain('stx-layout-group')
    expect(PREFLIGHT).toMatch(/(^|\n):root\s*\{/)
    // And the entries that follow it are all scoped, which is the other half
    // of the arrangement.
    for (const [i, entry] of ENTRIES.slice(1).entries())
      expect({ entry: i + 1, scoped: entry.includes('stx-layout-group') }).toEqual({ entry: i + 1, scoped: true })
  })

  test('the fonts are custom properties, which this engine never rewrites', async () => {
    /*
     * Not incidental. A `font-family` written literally in a preflight, in the
     * spaced rule form with a stack beginning `ui-sans-serif`, is replaced by
     * the theme's own sans -- measured on this engine in bughq, where it
     * silently repainted a page. Behind a custom property, and read through
     * `var(--font-body)` at every one of the 40-odd call sites in these
     * blocks, nothing is rewritten.
     */
    const css = await generate()
    expect(css).toContain('--font-display: "Space Grotesk", ui-sans-serif, system-ui, sans-serif')
    expect(css).toContain('--font-body: "Inter", ui-sans-serif, system-ui, sans-serif')
    for (const path of stxFiles(VIEWS)) {
      const source = readFileSync(path, 'utf8')
      for (const match of source.matchAll(/font-family\s*:\s*([^;}\n]+)/g))
        expect({ file: path.slice(VIEWS.length + 1), value: match[1].trim().startsWith('var(--font-') })
          .toEqual({ file: path.slice(VIEWS.length + 1), value: true })
    }
  })
})

describe('the scoped stylesheets', () => {
  /*
   * A preflight reaches every page, and this app gives the same class name
   * different meanings on different surfaces: forty names are declared in more
   * than one of its fourteen <style> blocks -- `.button`, `.brand`, `.panel`,
   * `.field`, `.pill`, `.dot`, `.section` among them. So each sheet carries
   * the layout group it belongs to, which stx emits into <head> from the
   * layout's filename and the router keeps fresh across navigations.
   */
  test('the prefix is written once, with nesting, not pasted onto every rule', () => {
    const app = ENTRIES.find(entry => entry.includes('content="default"')) ?? ''
    expect(app).not.toBe('')
    const prefixes = [...app.matchAll(/html:has\(meta/g)].length
    const rules = [...app.matchAll(/\{/g)].length
    expect({ prefixes: prefixes < 12, rules: rules > 100 }).toEqual({ prefixes: true, rules: true })
  })

  test('the rules rooted at or above <html> are spelled out, not nested', () => {
    /*
     * Three kinds cannot be nested under an `html` prefix because nesting
     * would make them `html:has(…) html`, which matches nothing: the
     * `html { background }` rule itself, the [data-theme] theme-toggle rules,
     * and `*`, which matched html and body where a nested one would not.
     */
    const app = ENTRIES.find(entry => entry.includes('content="default"')) ?? ''
    expect(app).toMatch(/^html:has\(meta\[name="stx-layout-group"\]\[content="default"\]\), html:has\([^)]*\) \* \{ box-sizing: border-box; \}/m)
    expect(app).toContain('[content="default"]) { background: var(--bg); }')
    expect(app).toContain('[content="default"])[data-theme="dark"] .theme-toggle .icon-moon')
    expect(app).toContain('[content="default"]):not([data-theme="light"]) .theme-toggle .icon-sun')
    expect(app).not.toMatch(/\{\s*html\s*\{/)
  })

  test('nested CSS survives the engine verbatim', async () => {
    // The whole scheme rests on this. Checked against the installed engine
    // rather than assumed, because a preflight that got flattened would
    // silently drop every rule in the block.
    const css = await generate()
    expect(css).toContain('html:has(meta[name="stx-layout-group"][content="default"]) {')
    expect(css).toContain('.app-shell')
    expect(css).toContain('.app-nav')
  })
})
