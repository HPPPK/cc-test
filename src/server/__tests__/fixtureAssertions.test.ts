import { describe, expect, it } from 'bun:test'
import { requireFixtureValue, withFetchPreconnect, makeSessionDetailFixture, invokeUncheckedFixture } from './fixtureAssertions.js'

describe('required fixture values', () => {
  it('preserves present falsy values and rejects absent contract fields', () => {
    expect(requireFixtureValue(false)).toBe(false)
    expect(requireFixtureValue(0)).toBe(0)
    expect(requireFixtureValue('')).toBe('')
    expect(() => requireFixtureValue(undefined)).toThrow('Expected fixture value to be present')
    expect(() => requireFixtureValue(null)).toThrow('Expected fixture value to be present')
  })
})

it('fetch fixtures retain their response and expose a harmless preconnect', async () => {
  const fetchImpl = withFetchPreconnect(async () => new Response('fixture'))
  fetchImpl.preconnect('https://example.test')
  expect(await (await fetchImpl('https://example.test')).text()).toBe('fixture')
})

it('session fixtures retain focused overrides within a complete envelope', () => {
  const session = makeSessionDetailFixture({ id: 'target-session', workDir: '/tmp/test-workspace' })
  expect(session.id).toBe('target-session')
  expect(session.workDir).toBe('/tmp/test-workspace')
  expect(session.messages).toEqual([])
  expect(session.createdAt).toBe('2026-05-20T00:00:00.000Z')
})

it('unchecked fixtures preserve validator rejection without widening its contract', () => {
  function requireString(value: string) { if (typeof value !== 'string') throw new Error('invalid string input'); return value }
  expect(() => invokeUncheckedFixture(requireString, undefined, [42])).toThrow('invalid string input')
  expect(invokeUncheckedFixture(requireString, undefined, ['valid'])).toBe('valid')
})
