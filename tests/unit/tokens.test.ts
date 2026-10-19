/**
 * The token manifest: this app's roles as values, for a renderer that is not
 * Crosswind.
 *
 * `scripts/tokens.ts` resolves every colour role `@stacksjs/components` reads
 * down to a literal, per surface and per colour mode, from the CSS the engine
 * actually receives. These tests pin the shape and the known limits.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dir, '../..')
const manifest = JSON.parse(readFileSync(join(ROOT, 'config/tokens.json'), 'utf8')) as {
  darkMode: boolean
  roles: Record<string, Record<string, Record<string, string>>>
  lost: string[]
}

describe('token manifest', () => {
  test('covers every surface this app has, in both modes', () => {
    expect(Object.keys(manifest.roles).sort()).toEqual(["auth", "base"])
    for (const surface of Object.keys(manifest.roles))
      expect(Object.keys(manifest.roles[surface]).sort(), surface).toEqual(['dark', 'light'])
  })

  test('every role resolves to a value, with no var() or template hole left in it', () => {
    for (const [surface, modes] of Object.entries(manifest.roles)) {
      for (const [mode, roles] of Object.entries(modes)) {
        expect(Object.keys(roles).length, `${surface}/${mode}`).toBe(19)
        for (const [role, value] of Object.entries(roles)) {
          expect(`${surface}/${mode}/${role}: ${value}`).not.toContain('var(')
          expect(`${surface}/${mode}/${role}: ${value}`).not.toContain('${')
        }
      }
    }
  })

  test('light and dark are different palettes', () => {
    expect(manifest.darkMode).toBe(true)
    for (const surface of Object.keys(manifest.roles)) {
      const light = manifest.roles[surface].light
      const dark = manifest.roles[surface].dark
      const identical = Object.keys(light).filter(role => light[role] === dark[role]).length
      const all = Object.keys(light).length
      // Every role matching means either the app has no dark mode, or the dark
      // context was never found. Those look identical here and are not.
      expect(`${surface}: ${identical === all}`).toBe(`${surface}: ${false}`)
    }
  })

  /*
   * Recorded, not asserted away. These are pairs the design system treats as
   * distinct that this app's palette resolves to one value, so a component
   * asking for either gets the same colour. The list exists so a NEW collapse
   * is visible rather than silent.
   */
  test('the known lost distinctions are exactly these', () => {
    expect(manifest.lost.sort()).toEqual(["fg = fg-strong", "fg-muted = fg-soft", "panel = field"])
  })
})
