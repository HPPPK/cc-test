import { expect, test } from 'bun:test'
import { upgradeWebSearchSettings } from './webSearchSettings.js'

test('upgrades old absent selections to Auto while preserving unknown future fields', () => {
  const legacy = { tavilyApiKey: 'fixture-key', future: { option: 7 } }
  expect(upgradeWebSearchSettings(legacy)).toEqual({ ...legacy, mode: 'auto' })
  expect(legacy).not.toHaveProperty('mode')
  expect(upgradeWebSearchSettings(undefined)).toEqual({ mode: 'auto' })
  expect(upgradeWebSearchSettings({ mode: 'future-provider', future: true })).toEqual({ mode: 'future-provider', future: true })
  expect(upgradeWebSearchSettings({ mode: 'tavily-keyless' })).toEqual({ mode: 'tavily-keyless' })
})
