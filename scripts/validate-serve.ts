/*
 * Renders pages through the PRODUCTION serve path and fails on stx expressions
 * that survived into the HTML.
 *
 * `bun run build` is not a substitute. `buddy serve` renders views from source
 * per request and resolves components differently: at one bughq commit
 * dist/login.html carried a fully resolved class list while the served page
 * emitted `class="{{ buttonClasses }}"`, so every <Button> on the site was a
 * bare unstyled element (stacksjs/stx#2037). Lint, tsc, stx typecheck, the test
 * suite, the build and release:validate were all green, because every one of
 * them inspects the build output.
 *
 * Attributes specifically: validate-visual.ts already looks for `{{`, but
 * through `document.body.innerText`, which by construction never contains an
 * attribute value. That blind spot is why it shipped. A served attribute value
 * never legitimately contains `{{`; an expression in TEXT is ordinary
 * client-rendered output and is not reported.
 *
 * Unlike the deployment smoke test this runs BEFORE a deploy, so it blocks
 * rather than reports.
 */
// `export {}` makes this a module. Without it TypeScript treats a file with no
// imports or exports as a script, where top-level `await` is an error (TS1375) —
// which analyticshq's tsconfig surfaces because it includes scripts/.
export {}

const ROUTES = [
  '/',
  '/login',
  '/dashboard',
  '/dashboard/monitors',
  '/dashboard/incidents',
  '/dashboard/servers',
  '/dashboard/settings/team',
  '/dashboard/status-pages',
]

const port = Number(process.env.SERVE_VALIDATE_PORT || 0) || 14000 + Math.floor(Math.random() * 900)
const proc = Bun.spawn(['bun', 'node_modules/@stacksjs/buddy/dist/cli.js', 'serve', '--port', String(port)], {
  cwd: process.cwd(),
  stdout: 'pipe',
  stderr: 'pipe',
  env: { ...process.env, APP_ENV: process.env.APP_ENV || 'development' },
})

async function waitForPort(ms: number): Promise<boolean> {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    try {
      const socket = await Bun.connect({ hostname: '127.0.0.1', port, socket: { data() {}, open() {}, error() {} } })
      socket.end()
      return true
    }
    catch { await Bun.sleep(500) }
  }
  return false
}

function unresolvedAttributes(html: string): string[] {
  const found = new Set<string>()
  for (const m of html.matchAll(/\s([a-zA-Z_:@][\w:.-]*)\s*=\s*"([^"]*\{\{[^"]*)"/g))
    found.add(`${m[1]}="${m[2].trim()}"`)
  return [...found]
}

if (!await waitForPort(120_000)) {
  proc.kill()
  const err = (await new Response(proc.stderr).text()).split('\n').slice(-15).join('\n')
  throw new Error(`The serve path did not start on port ${port}.\n${err}`)
}

const unresolved: string[] = []
const unreachable: string[] = []
let checked = 0
for (const route of ROUTES) {
  const res = await fetch(`http://127.0.0.1:${port}${route}`, { headers: { accept: 'text/html' }, signal: AbortSignal.timeout(45_000) })
  const html = await res.text()
  if (!res.ok) { unreachable.push(`${route} responded ${res.status}`); continue }
  checked += 1
  for (const leftover of unresolvedAttributes(html))
    unresolved.push(`${route}  ${leftover}`)
}
proc.kill()

// Two different failures, reported as two different things: a 404 is a routing
// or build problem, not a component rendering its own template, and labelling
// it as the latter sends the next person looking in the wrong place.
if (unreachable.length > 0) {
  console.error(`${unreachable.length} route(s) did not serve:`)
  for (const f of unreachable) console.error(`  - ${f}`)
}
if (unresolved.length > 0) {
  console.error(`${unresolved.length} unresolved expression(s) in attributes — a component rendered its own template instead of its output:`)
  for (const f of unresolved) console.error(`  - ${f}`)
}
if (unreachable.length + unresolved.length > 0) process.exit(1)

console.log(`Serve path renders clean: ${checked} routes, no stx expressions left in attributes.`)
/*
 * Explicit exit. Killing the spawned server can leave a socket or a piped
 * stdio handle pending, and loghq reliably rejected one AFTER every route had
 * passed — the checks printed clean and the process still exited 1, which in
 * CI is a red build with a green log. Nothing below this line matters, so stop
 * here rather than waiting for the loop to drain.
 */
process.exit(0)
