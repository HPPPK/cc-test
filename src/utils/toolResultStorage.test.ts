import { describe, expect, test } from 'bun:test'
import {
  buildLargeToolResultMessage,
  extractMachineReadableToolResultArtifacts,
} from './toolResultStorage.js'

describe('large tool-result metadata retention', () => {
  test('retains a complete Playwright ledger after a long page body is compacted', () => {
    const ledger = Buffer.from(JSON.stringify({
      url: 'https://www.google.com/search?q=quicker',
      accessLimited: false,
      steps: [{ index: 0, type: 'navigate', outcome: 'success' }],
    }), 'utf8').toString('base64')
    const artifact = `<playwright-action-ledger encoding="base64">${ledger}</playwright-action-ledger>`
    const fullResult = `Playwright result\n\n${artifact}\n\n${'page body '.repeat(1000)}`
    const preview = `Playwright result\n\n<playwright-action-ledger encoding="base64">${ledger.slice(0, 24)}`

    const machineReadableArtifacts = extractMachineReadableToolResultArtifacts(fullResult)
    expect(machineReadableArtifacts).toBe(artifact)

    const compacted = buildLargeToolResultMessage({
      filepath: 'C:/session/tool-results/call_google.txt',
      originalSize: fullResult.length,
      isJson: false,
      preview,
      hasMore: true,
      machineReadableArtifacts,
    })

    expect(compacted).toContain(artifact)
    expect(compacted).toContain('Machine-readable metadata retained for runtime auditing:')
  })

  test('does not retain arbitrary page text as machine-readable metadata', () => {
    expect(extractMachineReadableToolResultArtifacts('ordinary long page text')).toBeUndefined()
  })
})
