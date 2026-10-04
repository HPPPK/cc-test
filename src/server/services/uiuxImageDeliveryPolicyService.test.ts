import { describe, expect, it } from 'bun:test'
import { isUiuxImageOnlyBinding, UIUX_IMAGE_ONLY_RUNTIME_INSTRUCTION } from './uiuxImageDeliveryPolicyService.js'

const valid = { expertId: 'uiux-design-system-expert', packId: 'uiux-design-system-expert', runtimePolicy: { mode: 'strict-visual-workflow' as const, allowedToolNames: [], requiredSkillIds: [] }, outputProtocol: { path: 'output-protocol.json', content: '{"deliveryMode":"generated-image-only"}' } }
describe('UIUX exact identity opt-in', () => {
  it('separates successful generation from host preview failure and orders visible references first', () => {
    for (const requirement of ['inline image blocks', 'inspiration_sources', 'current viewport', 'visual-reference-receipt', 'image-revision-brief', 'repair_preview_then_read', 'never regenerate', 'license/use rights', 'design_task_action']) expect(UIUX_IMAGE_ONLY_RUNTIME_INSTRUCTION).toContain(requirement)
  })
  it('requires matching expert, pack, mode and delivery contract', () => {
    expect(isUiuxImageOnlyBinding(valid)).toBe(true)
    for (const expertId of ['web-information-designer', 'commercialization-research-report', 'custom']) expect(isUiuxImageOnlyBinding({ ...valid, expertId })).toBe(false)
    expect(isUiuxImageOnlyBinding({ ...valid, packId: 'web-information-designer' })).toBe(false)
    expect(isUiuxImageOnlyBinding({ ...valid, runtimePolicy: undefined })).toBe(false)
    expect(isUiuxImageOnlyBinding({ ...valid, outputProtocol: undefined })).toBe(false)
    expect(isUiuxImageOnlyBinding({ ...valid, outputProtocol: { path: 'x', content: '{invalid' } })).toBe(false)
    expect(isUiuxImageOnlyBinding({ ...valid, outputProtocol: { path: 'x', content: '{}' } })).toBe(false)
  })
})
