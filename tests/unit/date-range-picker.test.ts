import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dir, '../..')
const component = readFileSync(join(ROOT, 'resources/components/DateRangePicker.stx'), 'utf8')
const monitor = readFileSync(join(ROOT, 'resources/views/dashboard/monitors/[id].stx'), 'utf8')

const pureSlice = component.match(/\/\/ #region pure\n([\s\S]*?)\n\/\/ #endregion pure/)?.[1] ?? ''
const pure = new Function(`${pureSlice}\nreturn { pickGrid, pickShift, pickPreset, pickQuery }`)() as Record<string, (...a: any[]) => any>

describe('statushq monitor date picker: math + presets', () => {
  test('grid, leap Feb, future flag', () => {
    expect(pure.pickGrid('2026-06', '2026-09-16')).toHaveLength(42)
    expect(pure.pickGrid('2028-02', '2028-09-16').filter((c: any) => c.inMonth)).toHaveLength(29)
    expect(pure.pickGrid('2026-09', '2026-09-16').find((c: any) => c.ymd === '2026-09-17').future).toBe(true)
  })
  test('day shifts survive DST and year ends', () => {
    expect(pure.pickShift('2026-03-08', 1)).toBe('2026-03-09')
    expect(pure.pickShift('2026-01-01', -1)).toBe('2025-12-31')
  })
  test('statushq native windows go out as ?range=, and it offers no 90d/1y/all', () => {
    for (const key of ['24h', '7d', '30d'])
      expect(pure.pickPreset(key, '2026-09-16')).toEqual({ range: key })
    for (const key of ['90d', '1y', 'all'])
      expect(pure.pickPreset(key, '2026-09-16')).toBeNull()
    expect(component).toContain("pickApply('24h')")
    expect(component).not.toContain("pickApply('90d')")
  })
  test('calendar presets resolve to local day bounds', () => {
    expect(pure.pickPreset('today', '2026-09-16')).toEqual({ from: '2026-09-16', to: '2026-09-16' })
    expect(pure.pickPreset('last-month', '2026-09-16')).toEqual({ from: '2026-08-01', to: '2026-08-31' })
  })
})

describe('statushq monitor date picker: server wiring', () => {
  test('the view mounts the picker and reads a custom range', () => {
    expect(monitor).toContain('<DateRangePicker :summary="rangeLabel" :active="isCustom" />')
    expect(monitor).toContain('const isCustom = isDay(qFrom) && isDay(qTo)')
    expect(monitor).toContain("granularity = 'day'")
  })
  test('the volume query gains an upper bound and the fill runs from->to', () => {
    expect(monitor).toContain(".where('checked_at', '>=', since).where('checked_at', '<=', until)")
    expect(monitor).toContain('for (let t = fromMs; t <= toMs; t += stepMs)')
  })
  test('the chips stop reading active under a custom range', () => {
    expect(monitor).toContain("{{ !isCustom && range === '24h' ? 'active' : '' }}")
  })
})
