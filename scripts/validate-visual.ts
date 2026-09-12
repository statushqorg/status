import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

interface Viewport {
  name: string
  width: number
  height: number
  mobile: boolean
}

interface PageAudit {
  contrast: string[]
  focusable: number
  imagesWithoutAlt: number
  overflow: number
  unresolved: boolean
  unnamedControls: string[]
}

interface Pending {
  reject: (error: Error) => void
  resolve: (value: any) => void
  timer: ReturnType<typeof setTimeout>
}

const DIST = resolve('dist')
const SSR_OUTPUT = resolve('.output')
const SSR_PAGES = resolve(SSR_OUTPUT, 'server/pages')
const SSR_PUBLIC = resolve(SSR_OUTPUT, 'public')
const OUTPUT = resolve('storage/logs/visual-contract')
const VIEWPORTS: Viewport[] = [
  { name: 'desktop', width: 1440, height: 1000, mobile: false },
  { name: 'tablet', width: 768, height: 1024, mobile: false },
  { name: 'mobile', width: 390, height: 844, mobile: true },
]
const THEMES = ['light', 'dark'] as const
const ROUTE_CANDIDATES = [
  '/',
  '/login',
  '/register',
  '/dashboard',
  '/dashboard/commshq',
  '/reports',
  '/projects',
]

function chromePath(): string {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ]
  const found = candidates.find(candidate => candidate && existsSync(candidate))
  if (!found) throw new Error('Chrome was not found. Set CHROME_PATH to a Chrome or Chromium executable.')
  return found
}

async function waitFor<T>(read: () => Promise<T> | T, timeout = 12_000): Promise<T> {
  const started = Date.now()
  let value = await read()
  while (!value && Date.now() - started < timeout) {
    await Bun.sleep(100)
    value = await read()
  }
  if (!value) throw new Error(`Timed out after ${timeout}ms`)
  return value
}

class Cdp {
  private id = 0
  private pending = new Map<number, Pending>()

  constructor(private socket: WebSocket) {
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data))
      if (!message.id) return
      const pending = this.pending.get(message.id)
      if (!pending) return
      this.pending.delete(message.id)
      clearTimeout(pending.timer)
      if (message.error) pending.reject(new Error(message.error.message))
      else pending.resolve(message.result)
    })
  }

  send(method: string, params: Record<string, any> = {}): Promise<any> {
    const id = ++this.id
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Chrome command timed out: ${method}`))
      }, 15_000)
      this.pending.set(id, { reject, resolve, timer })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }

  async evaluate<T>(expression: string): Promise<T> {
    const result = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (result.exceptionDetails)
      throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
    return result.result?.value as T
  }
}

async function connect(url: string): Promise<Cdp> {
  const socket = new WebSocket(url)
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), { once: true })
    socket.addEventListener('error', () => reject(new Error('Could not connect to Chrome')), { once: true })
  })
  return new Cdp(socket)
}

function routeName(route: string): string {
  return route === '/' ? 'home' : route.slice(1).replaceAll('/', '-')
}

function routeFile(route: string): { kind: 'html' | 'ssr', path: string } | undefined {
  if (existsSync(DIST)) {
    const base = route === '/' ? join(DIST, 'index.html') : join(DIST, `${route.slice(1)}.html`)
    if (existsSync(base)) return { kind: 'html', path: base }
    const index = join(DIST, route.slice(1), 'index.html')
    if (existsSync(index)) return { kind: 'html', path: index }
  }

  const name = route === '/' ? 'index' : route.slice(1).replaceAll('/', '-')
  const compiled = join(SSR_PAGES, `${name}.compiled.json`)
  return existsSync(compiled) ? { kind: 'ssr', path: compiled } : undefined
}

function pageResponse(page: { kind: 'html' | 'ssr', path: string }): Response {
  if (page.kind === 'html') return new Response(Bun.file(page.path))
  const compiled = JSON.parse(readFileSync(page.path, 'utf8')) as { html?: string }
  return new Response(compiled.html || '', { headers: { 'content-type': 'text/html; charset=utf-8' } })
}

const auditExpression = `(() => {
  const visible = element => {
    const style = getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    if (element.closest('details:not([open])') && element.tagName !== 'SUMMARY') return false
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0
      && rect.width > 0 && rect.height > 0
  }
  const label = element => {
    if (element.getAttribute('aria-label')) return element.getAttribute('aria-label')
    const labelledBy = element.getAttribute('aria-labelledby')
    if (labelledBy && labelledBy.split(/\\s+/).some(id => document.getElementById(id)?.textContent?.trim())) return labelledBy
    if (element.id && document.querySelector('label[for="' + CSS.escape(element.id) + '"]')?.textContent?.trim()) return element.id
    if (element.closest('label')?.textContent?.trim()) return 'wrapped'
    if (element.tagName === 'BUTTON' && element.textContent?.trim()) return 'text'
    if (element.tagName === 'A' && element.textContent?.trim()) return 'text'
    if (element.getAttribute('title')) return element.getAttribute('title')
    return ''
  }
  const parseRgb = value => {
    const match = value.match(/rgba?\\(([^)]+)\\)/)
    if (!match) return null
    const parts = match[1].split(/[ ,/]+/).filter(Boolean).map(Number)
    if (parts.length < 3 || parts.some(Number.isNaN)) return null
    return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 }
  }
  const luminance = color => {
    const channel = value => {
      const normalized = value / 255
      return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b)
  }
  const background = element => {
    let current = element
    while (current) {
      const color = parseRgb(getComputedStyle(current).backgroundColor)
      if (color && color.a >= 0.98) return color
      current = current.parentElement
    }
    return { r: 255, g: 255, b: 255, a: 1 }
  }
  const controls = [...document.querySelectorAll('a[href], button, input:not([type="hidden"]), select, textarea')].filter(visible)
  const unnamedControls = controls.filter(element => !label(element)).map(element => {
    const identity = element.id ? '#' + element.id : element.getAttribute('name') ? '[name="' + element.getAttribute('name') + '"]' : ''
    return element.tagName.toLowerCase() + identity
  })
  const contrast = []
  const textElements = [...document.querySelectorAll('h1, h2, h3, h4, p, label, button, a, summary, span')]
  for (const element of textElements) {
    if (!visible(element) || !element.textContent?.trim()) continue
    if (element.children.length && !['A', 'BUTTON', 'SUMMARY'].includes(element.tagName)) continue
    const style = getComputedStyle(element)
    const foreground = parseRgb(style.color)
    const behind = background(element)
    if (!foreground || foreground.a < 0.98) continue
    const lighter = Math.max(luminance(foreground), luminance(behind))
    const darker = Math.min(luminance(foreground), luminance(behind))
    const ratio = (lighter + 0.05) / (darker + 0.05)
    const large = Number.parseFloat(style.fontSize) >= 24 || (Number.parseFloat(style.fontSize) >= 18.66 && Number(style.fontWeight) >= 700)
    if (ratio + 0.01 < (large ? 3 : 4.5)) {
      const sample = element.textContent.trim().replace(/\\s+/g, ' ').slice(0, 42)
      contrast.push(sample + ' (' + ratio.toFixed(2) + ':1)')
    }
    if (contrast.length >= 10) break
  }
  return {
    contrast,
    focusable: controls.length,
    imagesWithoutAlt: [...document.images].filter(image => !image.hasAttribute('alt')).length,
    overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    unresolved: document.body.innerText.includes('{{') || document.body.innerText.includes('@if'),
    unnamedControls,
  }
})()`

async function main(): Promise<void> {
  if (!existsSync(DIST) && !existsSync(SSR_PAGES))
    throw new Error(`Built site not found at ${DIST} or ${SSR_OUTPUT}. Run bun run build first.`)
  const routes = ROUTE_CANDIDATES.filter(route => routeFile(route))
  if (routes.length < 3) throw new Error(`Expected at least three visual routes, found ${routes.join(', ') || 'none'}.`)

  mkdirSync(OUTPUT, { recursive: true })
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request) {
      const url = new URL(request.url)
      const route = decodeURIComponent(url.pathname)
      const page = routeFile(route)
      if (page) return pageResponse(page)
      const publicRoot = existsSync(DIST) ? DIST : SSR_PUBLIC
      const asset = resolve(publicRoot, `.${route}`)
      const file = asset.startsWith(`${publicRoot}/`) && existsSync(asset) ? asset : undefined
      return file ? new Response(Bun.file(file)) : new Response('Not found', { status: 404 })
    },
  })
  const profile = mkdtempSync(join(tmpdir(), 'hq-visual-'))
  const chrome = Bun.spawn([
    chromePath(),
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-extensions',
    '--hide-scrollbars',
    '--no-sandbox',
    'about:blank',
  ], { stdout: 'ignore', stderr: 'ignore' })

  const failures: string[] = []
  let screenshots = 0
  try {
    const portFile = join(profile, 'DevToolsActivePort')
    await waitFor(() => existsSync(portFile), 10_000)
    const port = Number(readFileSync(portFile, 'utf8').split('\n')[0])
    const targets = await waitFor(async () => {
      const items = await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json()).catch(() => [])
      return Array.isArray(items) && items.length ? items : null
    }) as Array<{ type: string, url: string, webSocketDebuggerUrl: string }>
    const target = targets.find(item => item.type === 'page' && item.url === 'about:blank') || targets.find(item => item.type === 'page')
    if (!target) throw new Error('Chrome did not expose a page target.')

    const cdp = await connect(target.webSocketDebuggerUrl)
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')
    await cdp.send('Emulation.setScriptExecutionDisabled', { value: true })

    for (const route of routes) {
      for (const viewport of VIEWPORTS) {
        await cdp.send('Emulation.setDeviceMetricsOverride', {
          width: viewport.width,
          height: viewport.height,
          deviceScaleFactor: 1,
          mobile: viewport.mobile,
        })
        await cdp.send('Page.navigate', { url: `http://127.0.0.1:${server.port}${route}` })
        await waitFor(() => cdp.evaluate("document.readyState === 'complete'"))
        await Bun.sleep(100)
        for (const theme of THEMES) {
          await cdp.evaluate(`(() => {
            const theme = ${JSON.stringify(theme)}
            document.documentElement.classList.toggle('dark', theme === 'dark')
            document.documentElement.setAttribute('data-theme', theme)
            document.documentElement.setAttribute('data-color-mode', theme)
            document.documentElement.setAttribute('color-mode', theme)
          })()`)
          await Bun.sleep(500)
          const audit = await cdp.evaluate<PageAudit>(auditExpression)
          const key = `${route} at ${viewport.name}/${theme}`
          if (audit.overflow > 1) failures.push(`${key}: ${audit.overflow}px horizontal overflow`)
          if (audit.unresolved) failures.push(`${key}: unresolved template expression is visible`)
          if (audit.imagesWithoutAlt) failures.push(`${key}: ${audit.imagesWithoutAlt} image(s) have no alt attribute`)
          if (audit.unnamedControls.length) failures.push(`${key}: unnamed controls ${audit.unnamedControls.join(', ')}`)
          for (const issue of audit.contrast) failures.push(`${key}: low text contrast ${issue}`)

          if (audit.focusable) {
            await cdp.evaluate("document.body.setAttribute('tabindex', '-1'); document.body.focus()")
            await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 })
            await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 })
            const focused = await cdp.evaluate("document.activeElement && document.activeElement !== document.body && document.activeElement !== document.documentElement")
            if (!focused) failures.push(`${key}: Tab did not move focus to a control`)
          }

          const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, fromSurface: true })
          writeFileSync(join(OUTPUT, `${routeName(route)}-${theme}-${viewport.name}.png`), Buffer.from(shot.data, 'base64'))
          screenshots += 1
        }
      }
    }
  }
  finally {
    chrome.kill()
    await chrome.exited
    server.stop(true)
    rmSync(profile, { force: true, recursive: true })
  }

  console.log(`Rendered ${routes.length} routes in ${THEMES.length} themes at ${VIEWPORTS.length} viewports and wrote ${screenshots} screenshots.`)
  if (failures.length) {
    for (const failure of failures) console.error(`- ${failure}`)
    process.exit(1)
  }
}

await main()
