import { describe, expect, test } from 'bun:test'
import theme from '../../config/crosswind'
// The installed STX package does not export these subpaths by bare specifier.
import { loadCssEngine } from '../../node_modules/@stacksjs/stx/dist/dev-server/ts-css.js'
import { SEMANTIC_TOKENS, SHAPE_TOKENS } from '../../node_modules/@stacksjs/stx/dist/theme-tokens.js'
import { mergeCssConfig } from '../../node_modules/@stacksjs/stx/dist/ts-css-config.js'

const colors: Record<string, string> = theme.theme.extend.colors
const radii: Record<string, string> = theme.theme.extend.borderRadius

/*
 * The contract this app owes @stacksjs/components.
 *
 * Its components style themselves in role names (bg-field, bg-success-soft,
 * rounded-pill), which crosswind resolves as `var(--stx-<role>, <light value>)`
 * against its own :root/.dark defaults. This app themes with [data-theme] and
 * no `dark` class, so that .dark half NEVER matches: any role this palette
 * leaves unmapped keeps its LIGHT value in dark mode.
 *
 * The first pass here mapped only the roles something already used, which was
 * the wrong test and left 13 of 63 unmapped. Nothing caught it, because
 * "unmapped" looks fine until a component reaches for that role. This asserts
 * the whole vocabulary, so adopting any new component cannot reintroduce it.
 */
describe('component palette contract', () => {
  test('maps every installed library color and shape role', () => {
    expect(Object.keys(SEMANTIC_TOKENS).filter(role => !colors[role])).toEqual([])
    expect(Object.keys(SHAPE_TOKENS).filter(role => !radii[role])).toEqual([])
  })

  test('the real STX/Crosswind merge emits app values, not stock role fallbacks', async () => {
    const engine = await loadCssEngine()
    if (!engine) throw new Error('The installed STX CSS engine is required')
    const generator = new engine.CSSGenerator(mergeCssConfig(engine.defaultConfig || engine.config, theme).config)
    for (const role of Object.keys(SEMANTIC_TOKENS)) generator.generate(`bg-${role}`)
    for (const role of Object.keys(SHAPE_TOKENS)) generator.generate(`rounded-${role}`)
    const css = generator.toCSS(false, false)
    for (const role of Object.keys(SEMANTIC_TOKENS))
      expect(css).toContain(`.bg-${role} {\n  background-color: ${colors[role]};`)
    for (const role of Object.keys(SHAPE_TOKENS))
      expect(css).toContain(`.rounded-${role} {\n  border-radius: ${radii[role]};`)
    // The point of the whole exercise: no role may fall through to stx's own
    // light default, which this app's [data-theme] dark mode would never undo.
    expect(css).not.toContain('var(--stx-')
  })

  test('the status hues come from this palette, including its real amber', () => {
    // Unlike the other HQ apps, this one HAS an amber, so `warning` is a third
    // status hue rather than the neutral stand-in it has to be elsewhere.
    expect(colors.warning).toBe('var(--amber)')
    expect(colors['warning-soft']).toBe('var(--amber-soft)')
    expect(colors.success).toBe('var(--success)')
    expect(colors.danger).toBe('var(--danger)')
    // info and secondary stay neutral: there is no cyan or purple here, and a
    // stock light default that cannot re-theme is worse than a chosen neutral.
    expect(colors.info).toBe('var(--muted)')
    expect(colors.secondary).toBe('var(--muted)')
  })
})
