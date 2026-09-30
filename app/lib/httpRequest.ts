/**
 * The HTTP request an uptime monitor sends, and the status codes that count
 * as up, read from the monitor's `config` JSON.
 *
 * An uptime monitor used to be a GET that was up on any 2xx or 3xx. That
 * cannot watch an API whose healthy answer is a POST, or whose healthy answer
 * is a 4xx: a license check asked about a key that does not exist answers 404,
 * and that 404 is exactly the proof it is working. So a monitor may say, all
 * optional and all under `config`:
 *
 *   method          GET (default), HEAD, POST, PUT, PATCH, DELETE or OPTIONS
 *   headers         { name: value }, sent as given
 *   body            a string sent as is, or an object sent as JSON (with a
 *                   JSON content-type unless `headers` names one); never sent
 *                   with GET or HEAD
 *   expectedStatus  a status code or a list of them. When set, the check is up
 *                   when the response has one of them and down otherwise,
 *                   instead of the 2xx/3xx rule.
 *
 * Pure, so the rules are tested without a network. scripts/region-probe.ts is
 * a single self-contained file and mirrors this; change both together.
 */

export type MonitorMethod = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS'

export interface MonitorRequest {
  method: MonitorMethod
  headers: Record<string, string>
  body?: string
}

const METHODS = new Set<MonitorMethod>(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])

/** An RFC 9110 token: what a header name may be. Anything else (a CR or LF above all) is dropped. */
const HEADER_NAME = /^[!#$%&'*+.^\w`|~-]+$/

/** The request a monitor's config describes. Unknown or malformed settings fall back to a plain GET. */
export function monitorRequest(cfg: Record<string, unknown>): MonitorRequest {
  const rawMethod = typeof cfg.method === 'string' ? cfg.method.trim().toUpperCase() : 'GET'
  const method = METHODS.has(rawMethod as MonitorMethod) ? rawMethod as MonitorMethod : 'GET'

  const headers: Record<string, string> = {}
  if (cfg.headers && typeof cfg.headers === 'object' && !Array.isArray(cfg.headers)) {
    for (const [name, value] of Object.entries(cfg.headers as Record<string, unknown>)) {
      if (HEADER_NAME.test(name) && (typeof value === 'string' || typeof value === 'number') && !/[\r\n]/.test(String(value)))
        headers[name] = String(value)
    }
  }

  if (method === 'GET' || method === 'HEAD' || cfg.body === undefined || cfg.body === null)
    return { method, headers }

  if (typeof cfg.body === 'string')
    return { method, headers, body: cfg.body }

  const namesContentType = Object.keys(headers).some(name => name.toLowerCase() === 'content-type')
  return {
    method,
    headers: namesContentType ? headers : { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify(cfg.body),
  }
}

/** The status codes the config names as healthy, or null for the default 2xx/3xx rule. */
export function expectedStatuses(cfg: Record<string, unknown>): number[] | null {
  const raw = Array.isArray(cfg.expectedStatus) ? cfg.expectedStatus : cfg.expectedStatus === undefined ? [] : [cfg.expectedStatus]
  const codes = raw
    .map(code => typeof code === 'string' ? Number(code) : code)
    .filter((code): code is number => typeof code === 'number' && Number.isInteger(code) && code >= 100 && code <= 599)
  return codes.length ? codes : null
}

/** Whether a response status counts as up for this monitor. */
export function isExpectedStatus(cfg: Record<string, unknown>, status: number): boolean {
  const expected = expectedStatuses(cfg)
  return expected ? expected.includes(status) : status >= 200 && status < 400
}

/** Why a status did not count, for the check result's message. */
export function unexpectedStatusMessage(cfg: Record<string, unknown>, status: number): string {
  const expected = expectedStatuses(cfg)
  return expected
    ? `Unexpected status code ${status} (expected ${expected.join(' or ')})`
    : `Unexpected status code ${status}`
}
