/**
 * A page that cannot serve you must not offer you its controls.
 *
 * Four pages across this estate rendered their signed-in chrome directly above
 * their own signed-out gate: "+ New app" and "Log out" over a panel reading
 * "You're signed out", a fixed "Log out" button floating over the sign-in
 * prompt, a full reporting toolbar - range presets, Compare, CSV export - above
 * "Sign in to view analytics". Nothing leaked. Every one of those controls
 * answers 401, or logs nobody out, or re-queries a report whose payload comes
 * back with every number at zero. The bug is what it says to the visitor: a
 * page offering controls it cannot honour reads as broken rather than as
 * locked, and "Log out" in particular claims the visitor is signed in while the
 * panel beneath it says they are not.
 *
 * Two legitimate vehicles, and which one is right depends on where the viewer
 * comes from:
 *
 * - A page with a `<script server>` block that resolves the auth-token cookie
 *   knows the viewer BEFORE paint, so it branches: `@if (user)`. Nothing wrong
 *   is ever sent to the browser.
 * - A page whose viewer arrives from /api/me after paint cannot branch on the
 *   server, so it binds: `:show="!!user()"`. The signal is null until the
 *   request answers, which is why the binding must be positive ("show when
 *   there is a viewer") rather than negated - a negated guard would paint the
 *   control during the flight and hide it afterwards, which is the wrong way
 *   round.
 *
 * Both count here. What does not count is no guard at all.
 */
import { describe, expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dir, '../..')

/**
 * Controls that only mean something to a signed-in viewer.
 *
 * Deliberately narrow. A link to /pricing or /login is fine to show anyone, and
 * so is the theme toggle - it works signed out, and hiding it would be its own
 * small bug. These are the ones that either act on a session that does not
 * exist or re-read data the visitor has not been granted.
 */
const AFFORDANCE = /@click="(?:logout|signOut)"|>\s*Log out\s*<|@click="exportCsv"|Export this report/i

/**
 * Names that establish "this viewer is allowed to be here".
 *
 * `signedOut` belongs in the list: a block guarded by it is the signed-out
 * branch, and anything inside it was written for exactly that case.
 */
const VIEWER = '(?:user|viewGranted|ownsActive|signedIn|signedOut|isAuthed|authed|loggedIn|viewer)'
const GUARD_IF = new RegExp(`@if\\s*\\(\\s*!?\\s*${VIEWER}\\b`)
const SHOW_BIND = new RegExp(`:show="[^"]*${VIEWER}\\b[^"]*"`)
const IF_OPEN = /@if\s*\(/g
const IF_CLOSE = /@endif/g

function views(dir: string): string[] {
  const out: string[] = []
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    let directory = entry.isDirectory()
    if (entry.isSymbolicLink()) {
      try { directory = statSync(path).isDirectory() }
      catch { continue }
    }
    if (directory) out.push(...views(path))
    else if (entry.name.endsWith('.stx')) out.push(path)
  }
  return out
}

/**
 * stx comments, stripped first.
 *
 * The prose above each of these guards describes the control it guards, in the
 * words the detector matches - the comment on the fixed chrome says the words
 * "Log out" - so leaving comments in makes a file fail on its own explanation.
 * The busy-state gate learned this the same way.
 */
function code(source: string): string {
  return source.replace(/\{\{--[\s\S]*?--\}\}/g, '')
}

/**
 * Walk the file tracking @if depth, recording for each open block whether it
 * establishes a viewer. A line is covered when ANY enclosing block does, which
 * is what lets a guard wrap a whole header rather than each button inside it.
 */
function unguarded(source: string): string[] {
  const found: string[] = []
  const stack: boolean[] = []
  const lines = code(source).split('\n')
  for (const [index, line] of lines.entries()) {
    for (const match of line.matchAll(IF_OPEN))
      stack.push(GUARD_IF.test(line.slice(match.index)))
    for (const _ of line.matchAll(IF_CLOSE)) stack.pop()
    if (AFFORDANCE.test(line) && !stack.some(Boolean) && !SHOW_BIND.test(line))
      found.push(`${index + 1}: ${line.trim()}`)
  }
  return found
}

describe('signed-in controls are guarded', () => {
  const files = views(join(ROOT, 'resources'))

  test('every view carrying one is reachable only by a viewer', () => {
    const offenders: string[] = []
    for (const file of files) {
      const hits = unguarded(readFileSync(file, 'utf8'))
      for (const hit of hits)
        offenders.push(`${file.slice(ROOT.length + 1)}:${hit}`)
    }
    expect(offenders).toEqual([])
  })

  test('the sweep actually reads this app\'s views', () => {
    // The blind spot that makes a gate worthless: a path that resolves to
    // nothing passes forever. validate-ui shipped a breakpoint check that could
    // not fail in any of the six apps for exactly this reason.
    expect(files.length).toBeGreaterThan(5)
    expect(files.every(file => file.endsWith('.stx'))).toBe(true)
  })

  test('the detector still recognises both guards, and the absence of one', () => {
    const guarded = '@if (user)\n  <button @click="logout">Log out</button>\n@endif'
    const bound = '<button @click="logout" :show="!!user()">Log out</button>'
    const bare = '<button @click="logout">Log out</button>'
    const wrongGuard = '@if (isAll)\n  <button @click="logout">Log out</button>\n@endif'

    expect(unguarded(guarded)).toEqual([])
    expect(unguarded(bound)).toEqual([])
    expect(unguarded(bare)).toHaveLength(1)
    expect(unguarded(wrongGuard)).toHaveLength(1)
  })

  test('a comment naming the control does not fail the file', () => {
    expect(unguarded('{{-- the Log out button is guarded below --}}\n@if (user)\n  <button @click="logout">Log out</button>\n@endif')).toEqual([])
  })
})
