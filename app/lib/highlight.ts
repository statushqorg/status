import { highlightToHtml } from '@stacksjs/components'

/**
 * Syntax highlighting for the code this app shows: install snippets in
 * settings and the example code on the marketing pages.
 *
 * The tokenizer is stx's (`highlightToHtml` from `@stacksjs/components`, built
 * on ts-syntax-highlighter), and it runs on the server, so a page ships coloured
 * HTML and no highlighter. It writes a class on each token (`tok-keyword`) and
 * no colour; the colours are the `--stx-syntax-*` custom properties declared in
 * config/css.ts, so one piece of markup follows the theme toggle.
 *
 * What comes back is the INSIDE of a code element: the page keeps its own
 * panel, its own `<pre>` and its own copy button, which copies the source text
 * and never this markup.
 */
export type CodeLanguage = 'bash' | 'html' | 'json' | 'php' | 'typescript'

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Token markup for `code`, safe to print raw: every piece of the source goes
 * through the tokenizer's escaping, and the fallback escapes it here.
 * Highlighting is decoration, so anything it cannot handle renders as plain
 * escaped text rather than taking the block with it.
 */
export async function highlightCode(code: string, language: CodeLanguage): Promise<string> {
  const html = await highlightToHtml(code, { language }).catch(() => null)
  if (html === null)
    return escapeHtml(code)

  const start = html.indexOf('<code>')
  const end = html.lastIndexOf('</code>')
  if (start === -1 || end === -1)
    return escapeHtml(code)

  const inner = html.slice(start + '<code>'.length, end)
  return language === 'bash' ? repairShellComments(inner) : inner
}

/**
 * ts-syntax-highlighter 0.2.20's bash grammar reads `//` as a line comment, so
 * every URL in a shell snippet (`curl https://...`) turned comment-grey from the
 * `//` to the end of the line. Shell comments only ever start with `#`, so a
 * comment token that starts with `//` is always this bug: it is unwrapped, and
 * a real `# comment` it swallowed later on the line is wrapped again on its own.
 * The text is untouched either way; only the span around it moves.
 */
export function repairShellComments(html: string): string {
  return html.replace(/<span class="tok-comment">(\/\/[^<]*)<\/span>/g, (_match, text: string) => {
    const hash = text.search(/\s#/)
    if (hash === -1)
      return text
    return `${text.slice(0, hash + 1)}<span class="tok-comment">${text.slice(hash + 1)}</span>`
  })
}
