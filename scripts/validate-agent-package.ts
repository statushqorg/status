import { existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const root = resolve(import.meta.dir, '..')
const packageRoot = resolve(root, 'packages/agent')
const manifest = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8')) as {
  main?: string
  types?: string
  bin?: Record<string, string>
  files?: string[]
}

const required = [
  manifest.main,
  manifest.types,
  manifest.bin?.['statushq-agent'],
].filter((path): path is string => Boolean(path))

for (const path of required) {
  if (!existsSync(resolve(packageRoot, path)))
    throw new Error(`The package manifest references a missing artifact: ${path}`)
}

if (!manifest.files?.includes('dist') || manifest.files.includes('src'))
  throw new Error('The published package must include dist and exclude raw TypeScript sources.')

async function run(command: string[], cwd = root): Promise<string> {
  const child = Bun.spawn(command, {
    cwd,
    env: { ...process.env, NPM_CONFIG_CACHE: resolve(tmpdir(), 'statushq-agent-npm-cache') },
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  if (exitCode !== 0)
    throw new Error(`${command.join(' ')} failed:\n${stderr || stdout}`)
  return stdout
}

const moduleUrl = pathToFileURL(resolve(packageRoot, manifest.main!)).href
const imported = await run([
  'node',
  '--input-type=module',
  '--eval',
  `const agent = await import(${JSON.stringify(moduleUrl)}); if (typeof agent.startReporter !== 'function' || typeof agent.createHealthHandler !== 'function') process.exit(1)`,
])
if (imported.trim())
  console.log(imported.trim())

const help = await run([resolve(packageRoot, manifest.bin!['statushq-agent']!), 'help'])
if (!help.includes('Usage:') || !help.includes('statushq-agent report'))
  throw new Error('The packaged CLI did not execute under Node.')

const pack = JSON.parse(await run(['npm', 'pack', '--ignore-scripts', '--dry-run', '--json'], packageRoot)) as Array<{ files?: Array<{ path: string }> }>
const packedFiles = pack[0]?.files?.map(file => file.path) ?? []
if (!packedFiles.some(path => path === 'dist/index.js') || packedFiles.some(path => path.startsWith('src/')))
  throw new Error('npm pack does not contain the expected compiled-only payload.')

console.log(`Validated @statushq/agent for Node: ${packedFiles.length} packed files, library import and CLI execution passed.`)
