import { describe, expect, test } from 'bun:test'
import contracts from '../fixtures/sdk-metrics-contracts.json'
import { parseAgentMetricsPayload } from '../../app/Actions/Agents/metricsPayload'

describe('agent SDK compatibility', () => {
  for (const client of contracts.clients) {
    test(`${client.name} emits an accepted v${contracts.version} payload`, () => {
      expect(client.path).toBe('/api/agent/token/metrics')
      const parsed = parseAgentMetricsPayload(client.body)
      expect(parsed.ok).toBe(true)
      if (!parsed.ok)
        return

      expect(parsed.value.cpuPercent).toBe(client.body.cpuPercent)
      expect(parsed.value.ramPercent).toBe(client.body.ramPercent)
      expect(parsed.value.ramUsedMb).toBe(client.body.ramUsedMb)
      expect(parsed.value.ramTotalMb).toBe(client.body.ramTotalMb)
      expect(parsed.value.host).toBe(client.body.host)
    })
  }

  test('the shared boundary rejects values outside the documented ranges', () => {
    const rejected = parseAgentMetricsPayload({
      cpuPercent: 101,
      ramPercent: 20,
      ramUsedMb: 200,
      ramTotalMb: 1000,
    })
    expect(rejected.ok).toBe(false)
    expect(parseAgentMetricsPayload({
      cpuPercent: null,
      ramPercent: 20,
      ramUsedMb: 200,
      ramTotalMb: 1000,
    }).ok).toBe(false)
  })
})
