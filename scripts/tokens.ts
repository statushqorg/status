/**
 * The token layer: what this app's UI means, as values rather than as classes.
 *
 * stx ships 77 role tokens and `@stacksjs/components` is written against them --
 * `text-fg` 95 times, `text-fg-strong` 51, `bg-field` 34, `bg-accent-solid` 22.
 * This app, like the other five, already maps those role names onto its own
 * custom properties in `theme.extend.colors`, so a shared component does pick up
 * this app's colours. That mapping is the token layer; it just was not written
 * down anywhere a non-Crosswind renderer could read it.
 *
 * This emits it. For each role a component actually uses, resolve the utility
 * through the real engine (authoritative for role -> var) and then resolve the
 * var chain through this config's own declarations (authoritative for var ->
 * value). The result is a plain role -> literal manifest, which is the form a
 * native shell needs: `fg-strong` means #0b0f19 here, whatever Crosswind spells
 * it as.
 *
 * It also reports LOST DISTINCTIONS: pairs the design system treats as different
 * that this app resolves to the same literal. Those are not failures. An app with
 * one muted grey genuinely cannot express `fg-muted` and `fg-soft` separately,
 * and the honest first step is to see it, not to invent a colour. So this script
 * reports and exits 0.
 *
 * SURFACES. An app can carry more than one palette, scoped by selector, and a
 * manifest that flattens them emits pairs no page ever renders -- loghq hit
 * exactly that, mixing its marketing accent for light with its dashboard accent
 * for dark. So the manifest is per surface.
 *
 * Two surfaces: the default one, and a small auth override (5 scoped token
 * declarations against 59 unscoped).
 *
 * KNOWN LIMIT: a value built by string interpolation rather than written
 * literally cannot be resolved here; it is emitted as-is and flagged.
 */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import theme from '../config/crosswind'

const ROOT = resolve(import.meta.dir, '..')

/*
 * The roles `@stacksjs/components` actually reads, by measured usage in its
 * source: text-fg 95 times, text-fg-strong 51, text-fg-soft 48, text-fg-muted
 * 43, bg-panel 34, bg-field 34, border-line 33, text-danger 27, bg-accent-solid
 * 22, and so on.
 */
const ROLES = [
  'fg', 'fg-strong', 'fg-muted', 'fg-soft', 'fg-subtle',
  'page', 'panel', 'field', 'surface', 'surface-sunken',
  'line', 'line-strong',
  'accent', 'accent-solid', 'accent-ink',
  'danger', 'success', 'warning', 'info',
]

/** Pairs a component can render side by side and expects to tell apart. */
const MUST_DIFFER: [string, string][] = [
  ['fg', 'fg-strong'],
  ['fg-muted', 'fg-soft'],
  ['panel', 'field'],
  ['page', 'panel'],
  ['danger', 'warning'],
  ['success', 'warning'],
  ['accent', 'fg'],
  ['line', 'line-strong'],
]

/*
 * The CSS the engine actually receives, not the TypeScript that produces it.
 *
 * Parsing the config file was the wrong source and failed three different ways:
 * comments were read as selectors, `@media` nesting was lost to a regex, and
 * bughq -- where this was found -- declares its tokens as ARRAY ELEMENTS
 * (`` `--text: ${p.text}`, ``) with no semicolon at all, so a scan keyed on `;`
 * found none of them. `preflights[].getCSS()` is the generated stylesheet, so
 * every app's declarations arrive in one shape no matter how the config spells
 * them, already interpolated.
 */
const source = ((theme as { preflights?: { getCSS: () => string }[] }).preflights ?? [])
  .map(preflight => preflight.getCSS())
  .join('\n')

/**
 * The custom properties in force for one surface and one colour mode.
 *
 * Source order with later winning, which is what the cascade does for equal
 * specificity, rather than "first wins" -- the earlier version mixed the two and
 * produced a light value from one surface and a dark value from another.
 */
const SURFACES: Record<string, RegExp | null> = {
  base: null,
  auth: /content="auth"/,
}

/**
 * Walk the CSS with real brace matching, keeping the full selector stack.
 *
 * A regex over `selector { body }` cannot do this: an `@media` block contains
 * rules, so the match ends at the FIRST inner `}` and every nested selector is
 * swallowed into what looks like the media query's own body. This app has two
 * `@media (prefers-color-scheme: dark)` blocks, one of them holding the
 * `.page-dashboard` overrides -- so the naive version attributed the dashboard's
 * indigo to the base surface and reported an accent no base page renders.
 */
function* declarationsInContext(raw: string): Generator<[string, string, string]> {
  /*
   * Comments out first. The scan below treats whatever precedes a `{` as a
   * selector, so a comment is not inert here -- prose containing a brace, a
   * semicolon or the words `data-theme="dark"` lands in the selector stack and
   * can reclassify a whole block. Found while pointing this at the other five
   * apps, where sentences from comment blocks turned up as selector names.
   */
  const css = raw.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ')
  const stack: string[] = []
  let i = 0
  let pending = ''
  while (i < css.length) {
    const ch = css[i]
    if (ch === '{') {
      stack.push(pending.trim().replace(/\s+/g, ' '))
      pending = ''
      i++
    }
    else if (ch === '}') {
      stack.pop()
      pending = ''
      i++
    }
    else if (ch === ';') {
      const decl = /(--[a-z0-9][a-z0-9-]*)\s*:\s*(.+)/s.exec(pending.trim())
      if (decl)
        yield [stack.join(' | '), decl[1], decl[2].trim()]
      pending = ''
      i++
    }
    else {
      pending += ch
      i++
    }
  }
}

function declarations(surface: string, dark: boolean): Map<string, string> {
  const qualifier = SURFACES[surface]
  const out = new Map<string, string>()
  for (const [context, name, value] of declarationsInContext(source)) {
    const scoped = /content="[a-z-]+"|\.page-[a-z-]+/.test(context)
    if (qualifier ? (scoped && !qualifier.test(context)) : scoped)
      continue
    const isDark = /data-theme\s*=\s*["']dark["']|prefers-color-scheme:\s*dark/.test(context)
    // `@media (prefers-color-scheme: light)` counts too. Without it, a light
    // media block reads as unqualified and overwrites the dark column -- which
    // is what happened to analyticshq's dark-first marketing and auth surfaces,
    // where the unscoped block holds the DARK values and light is the override.
    const isLight = /data-theme\s*=\s*["']light["']|prefers-color-scheme:\s*light/.test(context)
    if (dark ? isLight : isDark)
      continue
    out.set(name, value)
  }
  return out
}

/**
 * Resolve `var()` by matching parentheses, not by regex.
 *
 * A regex has to bound how deep a fallback may nest, and these nest deeper than
 * is comfortable to guess: analyticshq declares
 * `warning: var(--warn, var(--text-2, var(--muted)))`, three levels, because
 * its three layout groups name that colour three different ways. A
 * one-level-nesting pattern resolved the inner chain and left the outer
 * `var(--warn, ...)` sitting in the output.
 */
function resolveValue(value: string, vars: Map<string, string>, depth = 0): string {
  if (depth > 8)
    return value

  let out = ''
  let i = 0
  while (i < value.length) {
    const at = value.indexOf('var(', i)
    if (at < 0) {
      out += value.slice(i)
      break
    }
    out += value.slice(i, at)

    let depthHere = 0
    let close = at + 3
    for (; close < value.length; close++) {
      if (value[close] === '(') depthHere++
      else if (value[close] === ')') { depthHere--; if (depthHere === 0) break }
    }
    const inner = value.slice(at + 4, close)

    // the first comma that is not inside a nested call separates name from fallback
    let comma = -1
    let nested = 0
    for (let x = 0; x < inner.length; x++) {
      if (inner[x] === '(') nested++
      else if (inner[x] === ')') nested--
      else if (inner[x] === ',' && nested === 0) { comma = x; break }
    }
    const name = (comma < 0 ? inner : inner.slice(0, comma)).trim()
    const fallback = comma < 0 ? '' : inner.slice(comma + 1).trim()

    const declared = vars.get(name)
    if (declared !== undefined)
      out += resolveValue(declared, vars, depth + 1)
    else if (fallback)
      out += resolveValue(fallback, vars, depth + 1)
    else
      out += value.slice(at, close + 1)

    i = close + 1
  }
  return out
}

/*
 * What each role is declared as, straight from `theme.extend.colors`.
 *
 * This is the same answer the CSS engine gives -- checked by generating the
 * utilities and comparing, e.g. `text-fg` emits `color: var(--text)` and
 * `colors.fg` is `var(--text)` -- but reading the theme needs no engine, no
 * `dist/` import, and no merge step.
 */
const colors = ((theme as { theme?: { extend?: { colors?: Record<string, string> } } })
  .theme?.extend?.colors) ?? {}

const manifest: Record<string, Record<string, Record<string, string>>> = {}
const unresolved: string[] = []
const missing: string[] = []

for (const surface of Object.keys(SURFACES)) {
  manifest[surface] = { light: {}, dark: {} }
  for (const mode of ['light', 'dark'] as const) {
    const vars = declarations(surface, mode === 'dark')
    for (const role of ROLES) {
      const expression = colors[role]
      if (!expression) {
        if (surface === Object.keys(SURFACES)[0] && mode === 'light') missing.push(role)
        continue
      }
      const value = resolveValue(expression, vars)
      manifest[surface][mode][role] = value
      if (value.includes('var(') || value.includes('${'))
        unresolved.push(`${surface}/${mode} ${role}: ${value}`)
    }
  }
}

/*
 * Whether this app has a dark mode at all.
 *
 * commshq has none -- not one `prefers-color-scheme: dark` or
 * `[data-theme="dark"]` in its stylesheet -- so its two columns are the same
 * palette twice. Recording that is the difference between "this app is
 * light-only" and "the dark context was never found", which look identical in
 * the output and are very different facts.
 */
const hasDarkMode = /prefers-color-scheme:\s*dark|data-theme\s*=\s*["']dark["']/.test(source)

/*
 * Read off the first surface. Not `base` by name: analyticshq declares almost
 * nothing unscoped and its surfaces are the three layout groups, so a hardcoded
 * `base` resolves to nothing there. A collapse is a limit of the palette rather
 * than of one surface anyway -- the surfaces differ in accent, not in whether
 * two greys are the same grey.
 */
const primary = Object.keys(SURFACES)[0]
const lost = MUST_DIFFER
  .filter(([a, b]) => manifest[primary].light[a] && manifest[primary].light[a] === manifest[primary].light[b])
  .map(([a, b]) => `${a} = ${b}`)

const out = resolve(ROOT, 'config/tokens.json')
writeFileSync(out, `${JSON.stringify({ darkMode: hasDarkMode, roles: manifest, lost }, null, 2)}\n`)

console.log(`Resolved ${Object.keys(manifest[primary].light).length} of ${ROLES.length} roles, per surface (${Object.keys(SURFACES).join(', ')}), light and dark.`)
if (missing.length)
  console.log(`  no utility generated for: ${missing.join(', ')}`)
if (unresolved.length) {
  console.log(`  not reducible to a literal (${unresolved.length}):`)
  for (const entry of unresolved) console.log(`    ${entry}`)
}
if (!hasDarkMode)
  console.log('  this app declares no dark mode; both columns are the same palette')
console.log(lost.length
  ? `  lost distinctions (${lost.length}): ${lost.join(', ')}`
  : '  no lost distinctions')
console.log(`Wrote ${out.replace(`${ROOT}/`, '')}`)
