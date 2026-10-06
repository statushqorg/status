import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A form error banner names one problem; the control it is about must be the
 * one marked `aria-invalid`.
 *
 * These views redirect back with `?error=<code>` and render a banner from a
 * label function. Each now also has an `errorField(s)` function mapping that
 * code to the control id to mark, so a screen reader reaches the field the
 * message is about instead of hearing the banner with no idea which of up to
 * 22 controls is wrong.
 *
 * Three ways that drifts silently, none of which any other gate can see:
 * a new error code added to the label function and not the field map; a
 * mapping left behind for a code that no longer exists; and a control id
 * renamed in the markup while the map still names the old one. All three
 * render perfectly and simply mark nothing.
 *
 * These pages are behind auth, so the serve gate cannot reach them and no
 * render check runs over them. Comparing the lists as text is cheap, needs no
 * browser or server, and is the only thing watching this.
 */
const ROOT = join(import.meta.dir, '../..')

interface View {
  file: string
  labelFn: string
  fieldFn: string
  /** Codes that correctly map to no control: a plan ceiling, an expired session. */
  fieldless: string[]
}

const VIEWS: View[] = [
  { file: 'dashboard/monitors/new.stx', labelFn: 'errorLabel', fieldFn: 'errorField', fieldless: ['plan_monitors'] },
  { file: 'dashboard/monitors/[id].stx', labelFn: 'formErrorLabel', fieldFn: 'errorFields', fieldless: [] },
  { file: 'dashboard/maintenance/index.stx', labelFn: 'errorLabel', fieldFn: 'errorFields', fieldless: ['status_invalid'] },
  { file: 'dashboard/maintenance/[id].stx', labelFn: 'errorLabel', fieldFn: 'errorFields', fieldless: [] },
  { file: 'dashboard/settings/security.stx', labelFn: 'errorLabel', fieldFn: 'errorFields', fieldless: ['setup_expired'] },
  { file: 'dashboard/status-reports/index.stx', labelFn: 'errorLabel', fieldFn: 'errorFields', fieldless: [] },
]

/**
 * Views whose code-to-field mapping lives outside the template, so only the
 * markup half can be checked here.
 */
const MAPPED_ELSEWHERE = [
  'dashboard/servers/index.stx',
  'dashboard/servers/[id].stx',
  'dashboard/settings/cloud.stx',
]

/** The `code === '…'` comparisons inside one function body. */
function codesIn(source: string, fn: string): Set<string> {
  const start = source.indexOf(`function ${fn}(code)`)
  expect(start, `${fn} not found`).toBeGreaterThan(-1)
  const body = source.slice(start, source.indexOf('\n}', start))
  return new Set([...body.matchAll(/code === '([a-z_]+)'/g)].map(m => m[1]))
}

/** Control ids the template marks against. */
function markedIds(source: string): Set<string> {
  return new Set(
    [...source.matchAll(/invalidFields?(?:\.includes\(|\s===\s)'([a-z_-]+)'/g)].map(m => m[1]),
  )
}

/** `id="…"` on every input, select and textarea. */
function controlIds(source: string): Set<string> {
  return new Set(
    [...source.matchAll(/<(?:input|select|textarea)\b[^>]*\bid="([^"{}]+)"/g)].map(m => m[1]),
  )
}

describe('views whose mapping lives in a lib or a map object', () => {
  for (const file of MAPPED_ELSEWHERE) {
    test(`${file}: marked controls exist and tags are well formed`, () => {
      const source = readFileSync(join(ROOT, 'resources/views', file), 'utf8')
      const controls = controlIds(source)
      const marked = markedIds(source)
      expect(marked.size).toBeGreaterThan(0)
      expect([...marked].filter(id => !controls.has(id))).toEqual([])

      const strays = [...source.matchAll(/<(?:input|select|textarea)\b[^>]*>/g)]
        .map(m => m[0])
        .filter(tag => /\s\/\s+[a-z:@]/i.test(tag))
      expect(strays).toEqual([])

      const referenced = new Set([...source.matchAll(/aria-describedby="([a-z-]+)"/g)].map(m => m[1]))
      expect(referenced.size).toBeGreaterThan(0)
      for (const id of referenced)
        expect(source).toContain(`id="${id}"`)
    })
  }
})

describe('form error banners mark the control they are about', () => {
  for (const view of VIEWS) {
    describe(view.file, () => {
      const source = readFileSync(join(ROOT, 'resources/views', view.file), 'utf8')

      test('every error code either maps to a control or is listed as fieldless', () => {
        const labelled = codesIn(source, view.labelFn)
        const mapped = codesIn(source, view.fieldFn)
        const unaccounted = [...labelled].filter(c => !mapped.has(c) && !view.fieldless.includes(c))
        expect(unaccounted).toEqual([])
      })

      test('no mapping is left behind for a code that no longer exists', () => {
        const labelled = codesIn(source, view.labelFn)
        const mapped = codesIn(source, view.fieldFn)
        expect([...mapped].filter(c => !labelled.has(c))).toEqual([])
      })

      test('every control the template marks exists in the markup', () => {
        const controls = controlIds(source)
        const marked = markedIds(source)
        expect(marked.size).toBeGreaterThan(0)
        expect([...marked].filter(id => !controls.has(id))).toEqual([])
      })

      test('no control tag carries a stray slash mid-attribute', () => {
        /*
         * Inserting attributes before a self-closing tag's `>` instead of
         * before its `/` leaves `placeholder="x" / aria-invalid="…">`. It
         * renders, tsc and lint pass, and these pages are behind auth so the
         * serve gate never sees them — this is the only thing watching.
         */
        const strays = [...source.matchAll(/<(?:input|select|textarea)\b[^>]*>/g)]
          .map(m => m[0])
          .filter(tag => /\s\/\s+[a-z:@]/i.test(tag))
        expect(strays).toEqual([])
      })

      test('the banner that aria-describedby points at exists', () => {
        const referenced = new Set(
          [...source.matchAll(/aria-describedby="([a-z-]+)"/g)].map(m => m[1]),
        )
        expect(referenced.size).toBeGreaterThan(0)
        for (const id of referenced)
          expect(source).toContain(`id="${id}"`)
      })
    })
  }
})
