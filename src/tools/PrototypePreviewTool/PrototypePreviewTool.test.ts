import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test'
import { PrototypePreviewTool, requirePrototypePreviewSession } from './PrototypePreviewTool.js'
import { expertRuntimeSessionStore } from '../../server/services/expertRuntimeSessionStore.js'
import { getAllBaseTools, getToolsForDefaultPreset } from '../../tools.js'

afterEach(() => mock.restore())
describe('PrototypePreview tool contract', () => {
  it('is registered and rejects arbitrary URL, path, commands and malformed screen IDs', () => {
    expect(getAllBaseTools().some(tool => tool.name === 'PrototypePreview')).toBe(true)
    expect(getToolsForDefaultPreset()).toContain('PrototypePreview')
    for (const input of [{ url: 'file:///secret' }, { workDir: 'C:/other' }, { command: 'calc' }, { screenId: '../../secret' }]) {
      expect(PrototypePreviewTool.inputSchema.safeParse(input).success).toBe(false)
    }
    expect(PrototypePreviewTool.inputSchema.parse({})).toEqual({ fidelity: 'high' })
    expect(PrototypePreviewTool.isConcurrencySafe()).toBe(false)
  })
  it('allows only the target expert with a declared tool and runtime allowlist', async () => {
    const lookup = spyOn(expertRuntimeSessionStore, 'get')
    for (const expert of [undefined, { expertId: 'uiux-design-system-expert' }, { expertId: 'web-information-designer', runtimeBinding: { runtimePolicy: { mode: 'prototype-visual-workflow', allowedToolNames: ['Bash'] }, tools: [] } }]) {
      lookup.mockResolvedValue(expert as any)
      await expect(requirePrototypePreviewSession('a')).rejects.toThrow('PROTOTYPE_PREVIEW_BINDING_REQUIRED')
    }
    lookup.mockResolvedValue({ expertId: 'web-information-designer', runtimeBinding: { runtimePolicy: { mode: 'prototype-visual-workflow', allowedToolNames: ['PrototypePreview'] }, tools: [{ hostToolId: 'PrototypePreview' }] } } as any)
    await requirePrototypePreviewSession('a')
    expect(lookup).toHaveBeenCalledTimes(4)
  })
})
