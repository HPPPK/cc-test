import { describe, expect, test } from 'bun:test'
import { resolveWorkflowSkillBindings } from './workflowSkillRegistry.js'

describe('workflow skill registry', () => {
  test('keeps legacy fallback contracts enabled by default', () => {
    const [resolution] = resolveWorkflowSkillBindings(['superpowers:brainstorming'])

    expect(resolution).toMatchObject({
      id: 'superpowers:brainstorming',
      availability: 'fallback',
    })
    expect(resolution?.fallbackContract).toContain('Clarify intent')
  })

  test('disables fallback contracts for pack workflows when the native skill is not installed', () => {
    const [resolution] = resolveWorkflowSkillBindings(['superpowers:brainstorming'], {
      installedSkillIds: new Set(),
      allowFallbackContracts: false,
    })

    expect(resolution).toEqual({
      id: 'superpowers:brainstorming',
      mode: 'native-if-installed-else-fallback-contract',
      availability: 'disabled',
    })
  })

  test('still marks pack workflow bindings native when the installed pack skill exposes the same id', () => {
    const [resolution] = resolveWorkflowSkillBindings(['superpowers:brainstorming'], {
      installedSkillIds: new Set(['superpowers:brainstorming']),
      allowFallbackContracts: false,
    })

    expect(resolution).toMatchObject({
      id: 'superpowers:brainstorming',
      availability: 'native',
    })
  })
})
