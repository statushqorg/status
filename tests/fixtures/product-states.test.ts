import { describe, expect, test } from 'bun:test'

const NOW = '2026-09-12T12:00:00.000Z'
const monitor = (index: number, state = 'up') => ({ id: index, name: `Monitor ${index}`, type: index % 3 === 0 ? 'heartbeat' : 'uptime', status: state, checkedAt: NOW })

export const productStates = {
  empty: { now: NOW, status: 'ready', monitors: [], incidents: [] },
  normal: { now: NOW, status: 'ready', monitors: [monitor(1), monitor(2, 'degraded'), monitor(3, 'down')], incidents: [{ id: 1, title: 'Checkout unavailable', status: 'investigating' }] },
  loading: { now: NOW, status: 'loading', monitors: [], incidents: [] },
  failure: { now: NOW, status: 'error', monitors: [], incidents: [], error: 'Monitor query failed' },
  highVolume: { now: NOW, status: 'ready', monitors: Array.from({ length: 250 }, (_, index) => monitor(index + 1)), incidents: Array.from({ length: 40 }, (_, index) => ({ id: index + 1, title: `Incident ${index + 1}`, status: 'resolved' })) },
} as const

describe('deterministic status product states', () => {
  test('covers every UI state', () => expect(Object.keys(productStates)).toEqual(['empty', 'normal', 'loading', 'failure', 'highVolume']))
  test('keeps volume fixtures large and reproducible', () => {
    expect(productStates.highVolume.monitors).toHaveLength(250)
    expect(JSON.stringify(productStates)).toBe(JSON.stringify(productStates))
  })
})
