import { describe, expect, test } from 'bun:test'
import { tsCloud } from '../../config/cloud'
import { postDatabaseSetupCommands } from '../../config/deps'

describe('production migration ownership', () => {
  test('Pantry does not run migrations on the deploy runner', () => {
    expect(postDatabaseSetupCommands(true)).toEqual([])
  })

  test('local setup still migrates and seeds development', () => {
    expect(postDatabaseSetupCommands(false)).toEqual([
      'bun buddy migrate',
      'bun buddy seed',
    ])
  })

  test('the main server remains the single production migration owner', () => {
    const sites = tsCloud.sites as Record<string, { preStart?: string[] }>
    const owners = Object.entries(sites)
      .filter(([, site]) => site.preStart?.includes('bun buddy migrate'))
      .map(([name]) => name)

    expect(owners).toEqual(['main'])
  })
})
