import { describe, expect, test } from 'bun:test'
import { resolveExpertTemplateFillOutputPolicy, resolveExpertTemplateFillOutputRoot } from './expertTemplateOutputPolicyService.js'

describe('resolveExpertTemplateFillOutputPolicy', () => {
  test('recognizes only the opt-in session workDir direct-output contract', () => {
    expect(resolveExpertTemplateFillOutputPolicy(JSON.stringify({
      primaryOutput: { autoDestination: { mode: 'session-workdir-direct' } },
    }))).toEqual({ mode: 'session-workdir-direct' })
  })

  test('leaves legacy, unrelated, and malformed protocols unchanged', () => {
    expect(resolveExpertTemplateFillOutputPolicy(JSON.stringify({
      primaryOutput: { autoDestination: { mode: 'session-workdir-default' } },
    }))).toBeUndefined()
    expect(resolveExpertTemplateFillOutputPolicy('{not json')).toBeUndefined()
    expect(resolveExpertTemplateFillOutputPolicy(undefined)).toBeUndefined()
  })

  test('uses only the persisted session workDir for an opted-in direct-output policy', () => {
    expect(resolveExpertTemplateFillOutputRoot({ mode: 'session-workdir-direct' }, '  C:\workspace\selected  ')).toBe('C:\workspace\selected')
    expect(resolveExpertTemplateFillOutputRoot(undefined, 'C:\workspace\selected')).toBeUndefined()
    expect(() => resolveExpertTemplateFillOutputRoot({ mode: 'session-workdir-direct' }, undefined)).toThrow('session.workDir')
  })
})
