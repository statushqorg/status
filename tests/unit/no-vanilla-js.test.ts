/**
 * Rule 8 (stx-standards 08-no-vanilla-js): no vanilla DOM in a client script.
 *
 * config/ui.ts turns stx's strict mode on, but that is only a partial gate.
 * The renderer validates whatever reaches validateClientScript, and a
 * signal-using <script client> block is re-tagged data-stx-scoped by
 * processScriptSetup and then skipped by process.js's own skipAttrs -- so the
 * blocks most likely to touch the DOM are the ones it never sees. It also
 * only ever checks pages something actually rendered, which makes a
 * dev-server boot a sampling exercise rather than a check.
 *
 * This reads the source instead, where no block has been re-tagged yet, so it
 * sees every one of them. It calls stx's own exported validator rather than
 * re-listing the prohibited patterns, so the rules cannot drift from the
 * engine's, and honours `stx-strict-ignore` markers because that validator
 * parses them itself.
 */
import { describe, expect, it } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { validateClientScript } from '@stacksjs/stx'

const root = process.cwd()

/** Vendored or generated; their violations are not this repo's to fix. */
const SKIP = new Set(['node_modules', 'storage', 'pantry', '.git', 'dist', 'public', 'coverage'])

/**
 * Not a client script: server blocks, external sources, and any explicit
 * non-JS type. Mirrors the skipAttrs process.js passes its scanner, minus the
 * two render-time markers (data-stx-scoped, data-stx-router) that by
 * definition cannot be in a source file -- excluding them here is what makes
 * this broader than the renderer.
 */
const NOT_CLIENT = /\bserver\b|\bsrc\s*=|\btype\s*=\s*["'](?!(?:text\/javascript|application\/javascript|module)["'])[^"']*["']/
const SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script>/g

function stxFiles(dir: string): string[] {
  let found: string[] = []
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name) || name.startsWith('.') && name !== '.stx') continue
    const path = join(dir, name)
    let entry
    try { entry = statSync(path) }
    catch { continue }
    if (entry.isDirectory()) found = found.concat(stxFiles(path))
    else if (path.endsWith('.stx')) found.push(path)
  }
  return found
}

function scan(): { blocks: number, files: number, violations: string[] } {
  const violations: string[] = []
  const files = stxFiles(root)
  let blocks = 0
  for (const file of files) {
    const name = relative(root, file)
    for (const [, attrs, body] of readFileSync(file, 'utf8').matchAll(SCRIPT)) {
      if (NOT_CLIENT.test(attrs ?? '')) continue
      blocks++
      // failOnViolation rather than reading console.warn: the validator
      // memoises per (content, file, config) and a remembered verdict
      // re-throws but does not warn again, so two identical blocks would
      // otherwise report once.
      try { validateClientScript(body ?? '', name, { enabled: true, failOnViolation: true, allowPatterns: [] }, name) }
      catch (error) { violations.push(error instanceof Error ? error.message : String(error)) }
    }
  }
  return { blocks, files: files.length, violations }
}

const result = scan()

describe('rule 8: no vanilla JS in client scripts', () => {
  it('reaches the client scripts it is meant to check', () => {
    // Without this the suite would pass just as happily on a scan that
    // matched nothing at all, which is the one failure mode a green test
    // cannot tell you about.
    expect(result.files).toBeGreaterThan(0)
    expect(result.blocks).toBeGreaterThan(0)
  })

  it('finds no prohibited DOM calls', () => {
    // Asserting on the joined report rather than a count: the diff on failure
    // is the list of offending files, lines and suggested composables.
    expect(result.violations.join('\n\n')).toBe('')
  })
})
