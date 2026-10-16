import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const root = process.cwd()
const resources = resolve(root, 'resources')
const issues = new Set<string>()

function filesIn(directory: string, pattern = /\.(?:stx|html|css)$/): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    return statSync(path).isDirectory() ? filesIn(path, pattern) : pattern.test(path) ? [path] : []
  })
}

function withoutComments(value: string): string {
  const preserveLines = (comment: string): string => comment.replace(/[^\n]/g, ' ')
  return value
    .replace(/<!--[^]*?-->/g, preserveLines)
    .replace(/\{\{--[^]*?--\}\}/g, preserveLines)
    .replace(/\/\*[^]*?\*\//g, preserveLines)
    .replace(/^\s*\/\/.*$/gm, preserveLines)
}

function lineAt(source: string, index: number): number {
  return source.slice(0, index).split('\n').length
}

function named(attributes: string): boolean {
  return /\b(?:aria-label|aria-labelledby|title|:aria-label)=/.test(attributes)
}

function report(file: string, source: string, index: number, message: string): void {
  issues.add(`${relative(root, file)}:${lineAt(source, index)}: ${message}`)
}

const files = filesIn(resources)
const markupFiles = files.filter(file => /\.(?:stx|html)$/.test(file))

/*
 * The two app-wide checks at the bottom of this file -- focus treatment and
 * responsive breakpoints -- used to read resources/ alone. That stopped
 * working when the last page <style> block moved out of a view and into
 * config/crosswind.ts under stx-standards rule 3: the treatments were still
 * there, in the one place the router preserves, and this script could no
 * longer see any of them. CI went red on `3135b80` and stayed red, which
 * skipped deploy-prod, so main stopped reaching production.
 *
 * So the corpus is resources/ PLUS the CSS config, which is where a page's CSS
 * is now supposed to live. Missing the config is a hard failure rather than an
 * empty read: a check that silently has nothing to search always passes.
 */
const cssConfig = resolve(root, 'config/crosswind.ts')
if (!existsSync(cssConfig))
  throw new Error(`validate-ui: expected the CSS config at ${relative(root, cssConfig)}`)

const combined = [...files, cssConfig].map(file => readFileSync(file, 'utf8')).join('\n')

for (const file of markupFiles) {
  const original = readFileSync(file, 'utf8')
  const source = withoutComments(original)

  for (const match of source.matchAll(/<img\b[^>]*>/gi)) {
    if (!/\b(?::?alt)=/.test(match[0]))
      report(file, source, match.index, 'image has no alt text')
  }

  for (const match of source.matchAll(/<button\b([^>]*)>([^]*?)<\/button>/gi)) {
    const attributes = match[1]
    const content = match[2]
      .replace(/<[^>]+>/g, '')
      .replace(/\{\{[^}]+\}\}/g, 'dynamic')
      .replace(/@[a-z]+\([^)]*\)/gi, '')
      .trim()
    if (!content && !named(attributes))
      report(file, source, match.index, 'icon-only button has no accessible name')
  }

  for (const match of source.matchAll(/<(input|select|textarea)\b([^>]*)>/gi)) {
    const attributes = match[2]
    if (/\btype=["']hidden["']/i.test(attributes) || named(attributes))
      continue
    const id = attributes.match(/\bid=["']([^"']+)["']/i)?.[1]
    const before = source.slice(0, match.index)
    const wrapped = before.lastIndexOf('<label') > before.lastIndexOf('</label>')
    const referenced = id ? new RegExp(`<label\\b[^>]*\\bfor=["']${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'i').test(source) : false
    if (!wrapped && !referenced)
      report(file, source, match.index, `${match[1].toLowerCase()} has no programmatic label`)
  }

  for (const match of source.matchAll(/\btabindex=["']([1-9]\d*)["']/gi))
    report(file, source, match.index, `positive tabindex ${match[1]} overrides natural keyboard order`)

  for (const match of source.matchAll(/<(?:div|span)\b([^>]*\bonclick=[^>]*)>/gi)) {
    if (!/\brole=["'](?:button|link)["']/i.test(match[1]) || !/\btabindex=["']0["']/i.test(match[1]))
      report(file, source, match.index, 'clickable non-interactive element is not keyboard accessible')
  }
}

/*
 * Em-dashes in copy a user can read.
 *
 * The house rule is in AGENTS.md: never an em-dash or a separator en-dash in a
 * headline, a body string, a label, a button, alt text, a tooltip or a
 * placeholder. It is named there as the most common AI design tell and listed as
 * a pre-flight item, and nothing enforced it -- 98 live ones across the six apps
 * when this check was written, every one shipped past a green CI.
 *
 * Over a wider corpus than the markup checks above, because copy is not only in
 * templates: resources/data/*.ts holds marketing tables and resources/emails/
 * holds mail bodies, and both reach a reader. filesIn() takes the pattern for
 * that reason; `combined` deliberately keeps the narrow one, since widening the
 * corpus of a check that looks for a treatment can only add ways for it to pass.
 *
 * Two shapes are not separators and are exempt:
 *
 *   '—'    a lone dash standing in for a value that does not exist (a field the
 *          SDK never sent, a count we never measured). A typographic placeholder
 *          rather than punctuation between clauses, and no hyphen reads as
 *          "no value".
 *   1–10   an en-dash between digits, which is a numeric range and the correct
 *          character for one. The rule bans the SEPARATOR en-dash, the one
 *          standing in for a comma or a full stop.
 */
for (const file of filesIn(resources, /\.(?:stx|html|ts)$/)) {
  const source = withoutComments(readFileSync(file, 'utf8'))
  for (const match of source.matchAll(/[\u2014\u2013]/g)) {
    const before = source.slice(Math.max(0, match.index - 1), match.index)
    const after = source.slice(match.index + 1, match.index + 2)
    if (/['"`>]/.test(before) && /['"`<]/.test(after))
      continue
    if (match[0] === '\u2013' && /\d/.test(before) && /\d/.test(after))
      continue
    report(file, source, match.index, 'em-dash in user-visible copy: use a hyphen, a comma, or two sentences')
  }
}

if (!/(?:focus-visible|:focus|focus:|focus-within)/.test(combined))
  issues.add('resources: no visible keyboard focus treatment found')
/*
 * The utility half needs a class-token boundary and not \b, which sits between
 * the hyphen and the s in `--radius-sm:` -- a custom property name was passing
 * this check on its own. With that fixed the check is carried by the 12 real
 * @media blocks in the CSS config, and removing them fails it, which is the
 * point.
 */
if (!/(?:@media|(?:^|[\s"'`:])(?:sm|md|lg|xl):)/m.test(combined))
  issues.add('resources: no responsive breakpoint treatment found')

console.log(`Validated ${markupFiles.length} UI templates across desktop, tablet, and mobile contracts.`)
if (issues.size) {
  for (const issue of [...issues].sort()) console.error(`- ${issue}`)
  process.exit(1)
}
