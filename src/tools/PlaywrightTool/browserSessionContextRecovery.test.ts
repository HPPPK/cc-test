import { describe, expect, test } from 'bun:test'
import { selectExistingBrowserContext } from './browserSessionContextRecovery'

describe('selectExistingBrowserContext', () => {
  test('keeps the direct context when it remains usable', () => {
    const direct = { id: 'direct' }
    const recovery = selectExistingBrowserContext([
      { source: 'direct', context: direct },
      { source: 'page', context: { id: 'page' } },
    ])

    expect(recovery).toEqual({ context: direct, source: 'direct' })
  })

  test('recovers from the preserved page before shared or browser fallbacks', () => {
    const page = { id: 'page' }
    const shared = { id: 'shared' }
    const browser = { id: 'browser' }

    const recovery = selectExistingBrowserContext([
      { source: 'direct' },
      { source: 'page', context: page },
      { source: 'shared', context: shared },
      { source: 'browser', context: browser },
    ])

    expect(recovery).toEqual({ context: page, source: 'page' })
  })

  test('uses the shared managed context before a generic managed-browser fallback', () => {
    const shared = { id: 'shared' }
    const browser = { id: 'browser' }

    const recovery = selectExistingBrowserContext([
      { source: 'direct' },
      { source: 'page' },
      { source: 'shared', context: shared },
      { source: 'browser', context: browser },
    ])

    expect(recovery).toEqual({ context: shared, source: 'shared' })
  })

  test('reports unavailable without inventing a new context', () => {
    expect(selectExistingBrowserContext([
      { source: 'direct' },
      { source: 'page' },
      { source: 'shared' },
      { source: 'browser' },
    ])).toEqual({ source: 'unavailable' })
  })
})
