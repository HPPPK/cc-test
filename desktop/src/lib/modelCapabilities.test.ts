import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DESKTOP_MODEL_CAPABILITIES,
  evaluateDesktopModelRequirements,
  getDesktopModelCapability,
  isImageLikeAttachment,
} from './modelCapabilities'

describe('desktop model capabilities', () => {
  it('falls back conservatively for unknown models', () => {
    const capability = getDesktopModelCapability('official', 'unknown-text-only-model')

    expect(capability.source).toBe('unknown')
    expect(capability.capabilities).toMatchObject({
      textInput: true,
      imageInput: false,
    })
  })

  it('allows image input for known vision-capable models', () => {
    const capability = getDesktopModelCapability('official', 'claude-sonnet-4-6')

    expect(capability.source).toBe('registry')
    expect(capability.capabilities.imageInput).toBe(true)
  })

  it('separates blocking required capability gaps from optional warnings', () => {
    const result = evaluateDesktopModelRequirements(DEFAULT_DESKTOP_MODEL_CAPABILITIES, {
      required: ['imageInput'],
      optional: ['pdfInput'],
    })

    expect(result.ok).toBe(false)
    expect(result.blockers).toEqual(['imageInput'])
    expect(result.warnings).toEqual(['pdfInput'])
  })

  it('detects image-like attachments by type, MIME, or filename', () => {
    expect(isImageLikeAttachment({ type: 'image' })).toBe(true)
    expect(isImageLikeAttachment({ mimeType: 'image/png' })).toBe(true)
    expect(isImageLikeAttachment({ name: 'screen.webp' })).toBe(true)
    expect(isImageLikeAttachment({ name: 'notes.txt' })).toBe(false)
  })
})
