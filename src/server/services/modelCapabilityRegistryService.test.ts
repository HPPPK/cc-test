import { describe, expect, test } from 'bun:test'
import {
  DEFAULT_MODEL_CAPABILITIES,
  capabilityFromProviderMetadata,
  evaluateModelCapabilityRequirements,
  getModelCapability,
} from './modelCapabilityRegistryService.js'

describe('modelCapabilityRegistryService', () => {
  test('returns registered capabilities for a known vision-capable model', () => {
    const capability = getModelCapability({ provider: 'official', modelId: 'claude-sonnet-4-6' })

    expect(capability.source).toBe('registry')
    expect(capability.capabilities.imageInput).toBe(true)
    expect(capability.capabilities.textInput).toBe(true)
  })

  test('falls back conservatively for unknown models', () => {
    const capability = getModelCapability({ provider: 'custom-provider', modelId: 'unknown-model' })

    expect(capability.source).toBe('unknown')
    expect(capability.capabilities).toEqual(DEFAULT_MODEL_CAPABILITIES)
    expect(capability.capabilities.imageInput).toBe(false)
  })


  test('derives image input support from provider model metadata', () => {
    const capability = capabilityFromProviderMetadata({
      id: 'vendor-vision-model',
      display_name: 'Vendor Vision Model',
      input_modalities: ['text', 'image'],
      capabilities: {
        tool_calling: true,
        structured_output: true,
      },
      context_length: 128000,
    })

    expect(capability?.displayName).toBe('Vendor Vision Model')
    expect(capability?.capabilities.imageInput).toBe(true)
    expect(capability?.capabilities.pdfInput).toBe(true)
    expect(capability?.capabilities.structuredOutput).toBe(true)
    expect(capability?.limits?.maxContextTokens).toBe(128000)
  })

  test('ignores provider metadata that has no capability signal', () => {
    const capability = capabilityFromProviderMetadata({
      id: 'plain-model',
      object: 'model',
      created: 123,
    })

    expect(capability).toBeNull()
  })

  test('blocks unmet required capabilities before workflow start', () => {
    const capability = getModelCapability({ provider: 'custom-provider', modelId: 'unknown-model' })
    const result = evaluateModelCapabilityRequirements(capability, {
      required: { imageInput: true, toolCalling: true },
    })

    expect(result.ok).toBe(false)
    expect(result.blockers.map((blocker) => blocker.capability)).toContain('imageInput')
  })

  test('warns but does not block unmet optional capabilities', () => {
    const capability = getModelCapability({ provider: 'custom-provider', modelId: 'unknown-model' })
    const result = evaluateModelCapabilityRequirements(capability, {
      optional: { imageInput: true },
    })

    expect(result.ok).toBe(true)
    expect(result.blockers).toEqual([])
    expect(result.warnings.map((warning) => warning.capability)).toContain('imageInput')
  })
})
