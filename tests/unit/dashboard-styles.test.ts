import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const VIEWS = join(import.meta.dir, '../../resources/views')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory())
      return walk(path)
    return path.endsWith('.stx') ? [path] : []
  })
}

function definedIn(source: string): Set<string> {
  const out = new Set<string>()
  for (const block of source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
    for (const match of block[1].matchAll(/\.([A-Za-z_][\w-]*)/g))
      out.add(match[1])
  }
  return out
}

function usedIn(source: string): Set<string> {
  const out = new Set<string>()
  for (const attr of source.matchAll(/class="([^"]*)"/g)) {
    // An interpolated class list is decided at render time; only the literal
    // prefix can be checked here.
    for (const name of attr[1].split(/\{\{|\{/)[0].split(/\s+/)) {
      if (/^[A-Za-z_][\w-]*$/.test(name))
        out.add(name)
    }
  }
  return out
}

// A view's <style> is emitted only on the page that declares it; nothing is
// shared between views. When markup is copied from one page to another
// without its CSS the classes render unstyled and nothing complains, which
// is how the server pages shipped with bare dialogs and a clipped install
// command. Anything two pages use has to live in the app-head partial.
describe('dashboard styles', () => {
  const dashboardAndPartials = walk(VIEWS).filter(file => file.includes('/dashboard/') || file.includes('/partials/'))
  const shared = new Set([
    ...definedIn(readFileSync(join(VIEWS, 'partials/app-head.stx'), 'utf8')),
    ...definedIn(readFileSync(join(VIEWS, 'partials/app-nav.stx'), 'utf8')),
  ])
  // Utility classes and script hooks are declared in no stylesheet at all and
  // are not what this guards against; only a class some view does declare
  // counts as missing when another view uses it.
  const declaredByAnyView = new Set(dashboardAndPartials.flatMap(file => [...definedIn(readFileSync(file, 'utf8'))]))

  test('no dashboard view uses a class that only another view declares', () => {
    const orphans: Record<string, string[]> = {}
    for (const file of dashboardAndPartials.filter(file => file.includes('/dashboard/'))) {
      const source = readFileSync(file, 'utf8')
      const own = definedIn(source)
      const missing = [...usedIn(source)].filter(name => !own.has(name) && !shared.has(name) && declaredByAnyView.has(name))
      if (missing.length)
        orphans[relative(VIEWS, file)] = missing.sort()
    }
    expect(orphans).toEqual({})
  })
})
