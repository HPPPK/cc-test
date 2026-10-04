import type { ExpertRuntimeBinding } from './expertPackRegistryService.js'

export { UIUX_IMAGE_ONLY_TOOLS, UIUX_IMAGE_ONLY_RUNTIME_INSTRUCTION } from '../../services/tools/uiuxImageContract.js'

/** Exact package identity plus opt-in; never infer the Expert from a sample page. */
export function isUiuxImageOnlyBinding(binding: Pick<ExpertRuntimeBinding, 'expertId' | 'packId' | 'runtimePolicy' | 'outputProtocol'>): boolean {
  if (binding.expertId !== 'uiux-design-system-expert' || binding.packId !== 'uiux-design-system-expert'
    || binding.runtimePolicy?.mode !== 'strict-visual-workflow') return false
  try { return JSON.parse(binding.outputProtocol?.content ?? '{}').deliveryMode === 'generated-image-only' } catch { return false }
}

