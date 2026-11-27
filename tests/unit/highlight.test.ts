import { describe, expect, test } from 'bun:test'
import { highlightCode, repairShellComments } from '../../app/lib/highlight'

/** The text a reader sees: tags stripped, entities decoded. */
function text(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
}

describe('highlightCode', () => {
  test('returns token markup, not a whole pre element', async () => {
    const html = await highlightCode(`import { x } from 'y'`, 'typescript')
    expect(html).toContain('<span class="tok-keyword">import</span>')
    expect(html).not.toContain('<pre')
    expect(html).not.toContain('<code')
  })

  test('the text is exactly the source, escaped', async () => {
    const source = `<script src="https://x.org/a.js"></script>\n# a & b`
    const html = await highlightCode(source, 'html')
    expect(text(html)).toBe(source)
    expect(html).not.toContain('<script')
  })
})

describe('shell comments (ts-syntax-highlighter reads // as a comment)', () => {
  test('a URL is not a comment', async () => {
    const html = await highlightCode('curl -X POST https://statushq.org/api/monitors', 'bash')
    expect(html).not.toContain('tok-comment')
    expect(text(html)).toBe('curl -X POST https://statushq.org/api/monitors')
  })

  test('a real # comment after a URL is still a comment', async () => {
    const html = await highlightCode('curl https://x.org/a # the endpoint', 'bash')
    expect(html).toContain('<span class="tok-comment"># the endpoint</span>')
    expect(text(html)).toBe('curl https://x.org/a # the endpoint')
  })

  test('a line comment of its own is untouched', async () => {
    expect(await highlightCode('# nightly backup', 'bash')).toContain('<span class="tok-comment"># nightly backup</span>')
  })

  test('only bash is repaired: // is a real comment in TypeScript', async () => {
    expect(await highlightCode('// note', 'typescript')).toContain('<span class="tok-comment">// note</span>')
    expect(repairShellComments('<span class="tok-comment">// x</span>')).toBe('// x')
  })
})
