import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

interface SmokeContract {
  domain: string
  homeText: string
}

const CONTRACTS: Record<string, SmokeContract> = {
  analyticshq: { domain: 'analyticshq.org', homeText: 'analyticshq' },
  bughq: { domain: 'bughq.org', homeText: 'Error tracking for people who ship.' },
  commshq: { domain: 'commshq.org', homeText: 'Grow an audience worth knowing.' },
  loghq: { domain: 'loghq.org', homeText: 'Your logs, finally worth reading.' },
  reportshq: { domain: 'reportshq.org', homeText: 'Reports that build themselves' },
  status: { domain: 'statushq.org', homeText: 'Know the moment' },
}

const projectRoot = resolve(import.meta.dir, '..')
const packageJson = JSON.parse(readFileSync(resolve(projectRoot, 'package.json'), 'utf8')) as { name?: string }
const packageName = String(packageJson.name || '')
const directoryName = projectRoot.split('/').pop() || ''
const appName = CONTRACTS[packageName] ? packageName : directoryName
const contract = CONTRACTS[appName]

if (!contract) throw new Error(`No deployment smoke contract exists for ${appName || '(unnamed)'}.`)

const baseUrl = String(process.env.SMOKE_BASE_URL || `https://${contract.domain}`).replace(/\/$/, '')
const attempts = Math.max(1, Number(process.env.SMOKE_ATTEMPTS || 10))
const pauseMs = Math.max(0, Number(process.env.SMOKE_RETRY_MS || 3000))

async function readWithRetry(path: string): Promise<string> {
  let lastFailure = 'no response'
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const separator = path.includes('?') ? '&' : '?'
      const response = await fetch(`${baseUrl}${path}${separator}smoke=${Date.now()}`, {
        headers: { accept: path === '/robots.txt' ? 'text/plain' : 'text/html' },
        redirect: 'follow',
        signal: AbortSignal.timeout(10_000),
      })
      const body = await response.text()
      if (response.ok) return body
      lastFailure = `HTTP ${response.status}`
    }
    catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error)
    }
    if (attempt < attempts) await Bun.sleep(pauseMs)
  }
  throw new Error(`${baseUrl}${path} failed after ${attempts} attempts: ${lastFailure}`)
}

const home = await readWithRetry('/')
if (!home.includes(contract.homeText)) throw new Error(`Homepage does not contain the expected release marker: ${contract.homeText}`)

const login = await readWithRetry('/login')
if (!/<(?:form|main)\b/i.test(login)) throw new Error('Login smoke response does not contain an application form or main region.')

const robots = await readWithRetry('/robots.txt')
if (robots.includes('http://localhost')) throw new Error('Deployed robots.txt contains a localhost URL.')
if (!robots.includes(new URL(baseUrl).hostname)) throw new Error(`Deployed robots.txt does not name ${new URL(baseUrl).hostname}.`)

console.log(`Deployment smoke passed for ${baseUrl}: homepage, login, and robots metadata are live.`)
