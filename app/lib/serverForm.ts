/**
 * Parsing and defaults for the server dialogs.
 *
 * The counterpart to `monitorForm.ts`, and deliberately the same shape: a
 * browser form cannot render the router's 422 JSON, so every server action
 * normalises here and redirects with a `?error=` code the page turns into a
 * flash. `intInRange` is reused rather than re-implemented, because two
 * spellings of "is this a percentage" is how a 0 ends up meaning blank in one
 * dialog and off in another.
 *
 * Nothing here reads `status` or `last_sample_at`. Those are written by the
 * ingest, by `CheckStaleServers` and by the backfill, and they are not form
 * fields on any page - an operator cannot type a box into being healthy.
 */

import { intInRange } from './monitorForm'

export interface ServerFormInput {
  name?: unknown
  cpu_threshold?: unknown
  ram_threshold?: unknown
  disk_threshold?: unknown
  metrics_window_seconds?: unknown
}

export interface ServerFormResult {
  values: {
    name: string
    cpu_threshold: number
    ram_threshold: number
    disk_threshold: number
    metrics_window_seconds: number
  }
  /** Snake_case code for the `?error=` redirect, or null when valid. */
  error: string | null
}

/** What a box alerts at when the operator says nothing. */
export const DEFAULT_CPU_THRESHOLD = 90
export const DEFAULT_RAM_THRESHOLD = 90
export const DEFAULT_DISK_THRESHOLD = 85

/**
 * How long a box may go without pushing before it counts as quiet.
 *
 * Five minutes, which has to stay comfortably above the agent's own interval:
 * a window shorter than the push interval means the box alerts between every
 * pair of samples. The dialog says so.
 */
export const DEFAULT_METRICS_WINDOW_SECONDS = 300

/** The shortest window worth having. Below this a normal push cadence trips it. */
export const MIN_METRICS_WINDOW_SECONDS = 30
export const MAX_METRICS_WINDOW_SECONDS = 86_400

const MAX_NAME_LENGTH = 150

function fail(error: string): ServerFormResult {
  return {
    values: {
      name: '',
      cpu_threshold: DEFAULT_CPU_THRESHOLD,
      ram_threshold: DEFAULT_RAM_THRESHOLD,
      disk_threshold: DEFAULT_DISK_THRESHOLD,
      metrics_window_seconds: DEFAULT_METRICS_WINDOW_SECONDS,
    },
    error,
  }
}

/**
 * A blank threshold means "use the default", and 0 means "off".
 *
 * Those are different answers and `intInRange` already separates them: it
 * returns null for blank and 0 for a real zero. Collapsing them with `||`
 * would silently turn every disabled threshold back on at 90%.
 */
function thresholdOr(raw: unknown, fallback: number): number {
  const parsed = intInRange(raw, 0, 100)
  return parsed === null ? fallback : parsed
}

export function parseServerForm(input: ServerFormInput): ServerFormResult {
  const name = String(input.name ?? '').trim()
  if (!name)
    return fail('name_required')
  if (name.length > MAX_NAME_LENGTH)
    return fail('name_too_long')

  // A window below the floor is a mistake worth refusing rather than
  // clamping: the operator asked for something that would alert constantly,
  // and silently widening it would hide that.
  const rawWindow = input.metrics_window_seconds
  const blankWindow = rawWindow === undefined || rawWindow === null || String(rawWindow).trim() === ''
  const window = blankWindow
    ? DEFAULT_METRICS_WINDOW_SECONDS
    : intInRange(rawWindow, MIN_METRICS_WINDOW_SECONDS, MAX_METRICS_WINDOW_SECONDS)
  if (window === null)
    return fail('window_invalid')

  return {
    values: {
      name,
      cpu_threshold: thresholdOr(input.cpu_threshold, DEFAULT_CPU_THRESHOLD),
      ram_threshold: thresholdOr(input.ram_threshold, DEFAULT_RAM_THRESHOLD),
      disk_threshold: thresholdOr(input.disk_threshold, DEFAULT_DISK_THRESHOLD),
      metrics_window_seconds: window,
    },
    error: null,
  }
}

/** The message a `?error=` code becomes on the page. */
export function serverFormErrorLabel(code: string | null | undefined): string {
  switch (code) {
    case 'name_required': return 'Give the server a name.'
    case 'name_too_long': return `A server name can be at most ${MAX_NAME_LENGTH} characters.`
    case 'window_invalid': return `The missed-push window must be between ${MIN_METRICS_WINDOW_SECONDS} and ${MAX_METRICS_WINDOW_SECONDS} seconds.`
    case 'server_not_found': return 'That server is not in your team.'
    case 'monitor_not_found': return 'That monitor is not in your team.'
    default: return 'Something in that form could not be saved.'
  }
}
