export interface AgentMetricsPayload {
  cpuPercent: number
  ramPercent: number
  ramUsedMb: number
  ramTotalMb: number
  diskPercent: number | null
  hasDisk: boolean
  host?: unknown
}

export type AgentMetricsPayloadResult =
  | { ok: true, value: AgentMetricsPayload }
  | { ok: false, error: string }

function isValidPercent(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 100
}

function isValidMb(value: number): boolean {
  return Number.isFinite(value) && value >= 0
}

function requiredNumber(value: unknown): number {
  return value === undefined || value === null || value === '' ? Number.NaN : Number(value)
}

/**
 * The shared wire boundary for @statushq/agent, the installer shell agent, and
 * statushq/laravel-sdk. Both the current Server path and the legacy Monitor
 * path consume this parser so compatibility cannot diverge during migration.
 */
export function parseAgentMetricsPayload(input: Record<string, unknown>): AgentMetricsPayloadResult {
  const cpuPercent = requiredNumber(input.cpuPercent)
  const ramPercent = requiredNumber(input.ramPercent)
  const ramUsedMb = requiredNumber(input.ramUsedMb)
  const ramTotalMb = requiredNumber(input.ramTotalMb)
  const rawDisk = input.diskPercent
  const hasDisk = rawDisk !== undefined && rawDisk !== null && rawDisk !== ''
  const diskPercent = hasDisk ? Number(rawDisk) : null

  if (!isValidPercent(cpuPercent)
    || !isValidPercent(ramPercent)
    || !isValidMb(ramUsedMb)
    || !isValidMb(ramTotalMb)
    || (hasDisk && !isValidPercent(diskPercent as number))) {
    return {
      ok: false,
      error: 'cpuPercent/ramPercent/diskPercent must be 0-100, ramUsedMb/ramTotalMb must be >= 0',
    }
  }

  return {
    ok: true,
    value: {
      cpuPercent,
      ramPercent,
      ramUsedMb,
      ramTotalMb,
      diskPercent,
      hasDisk,
      host: input.host,
    },
  }
}
