import { z } from 'zod/v4'
import { buildTool } from '../../Tool.js'
import { getCwd } from '../../utils/cwd.js'
import { getJiangxiaEnvValue } from '../../utils/appIdentity.js'
import { expertRuntimeSessionStore } from '../../server/services/expertRuntimeSessionStore.js'
import { PROTOTYPE_PREVIEW_TOOL, prototypePreviewSchema, renderPrototypePreview, formatPrototypePreviewReceipt } from '../../server/services/prototypePreviewService.js'

const inputSchema = z.strictObject({ fidelity: z.enum(['low', 'mid', 'high']).default('high'), screenId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional().describe('Optional screen to open via ?screen=ID&export=1; HTML must expose a visible matching data-screen-id') })

export async function requirePrototypePreviewSession(sessionId: string | undefined): Promise<void> {
  const expert = sessionId ? await expertRuntimeSessionStore.get(sessionId) : undefined
  if (expert?.expertId !== 'web-information-designer' || expert.runtimeBinding?.runtimePolicy?.mode !== 'prototype-visual-workflow'
    || !expert.runtimeBinding.runtimePolicy.allowedToolNames.includes(PROTOTYPE_PREVIEW_TOOL)
    || !expert.runtimeBinding.tools.some(tool => tool.hostToolId === PROTOTYPE_PREVIEW_TOOL)) {
    throw new Error('PROTOTYPE_PREVIEW_BINDING_REQUIRED: select 原型图demo with a ZIP declaring PrototypePreview; old session bindings must be upgraded or recreated.')
  }
}

export const PrototypePreviewTool = buildTool({
  name: PROTOTYPE_PREVIEW_TOOL,
  searchHint: 'Render local prototype HTML into verified viewport screenshots',
  maxResultSizeChars: 64_000,
  alwaysLoad: true,
  async description() { return 'Render the current prototype HTML and measure viewport layout' },
  userFacingName() { return '原型图demo本地预览' },
  get inputSchema() { return inputSchema },
  get outputSchema() { return prototypePreviewSchema },
  // Availability is discoverable before session launch; call enforces the Expert binding.
  isEnabled() { return true },
  isConcurrencySafe() { return false },
  isReadOnly() { return false },
  async checkPermissions(input) { return { behavior: 'allow' as const, updatedInput: input } },
  async prompt() { return 'For 原型图demo only. Render 01-low-fidelity.html, 02-mid-fidelity.html or 03-high-fidelity.html in the active workDir. High fidelity captures real CSS viewports 1440x1000, 1024x900 and 390x844. Awaited PNGs are saved to unique imgs/qa/<runId>/ paths with source/image hashes. Network resources are blocked; use inline CSS/JS and local assets. Read the exact returned PNG paths, inspect them, fix measured issues, rerender and Read again. This tool is render/layout evidence, not visual acceptance or real-device testing. Use optional screenId for per-screen captures; the HTML must expose a matching data-screen-id, visible at ?screen=ID&export=1. Per-screen receipts do not replace the main three-viewport receipt. No URL, browser command, or output path is accepted.' },
  renderToolUseMessage(input) { return 'PrototypePreview: ' + input.fidelity },
  renderToolResultMessage(output) { return 'PrototypePreview: ' + output.status + ' (' + output.screenshots.length + ' screenshots)' },
  mapToolResultToToolResultBlockParam(output, toolUseID) { return { type: 'tool_result', tool_use_id: toolUseID, content: formatPrototypePreviewReceipt(output) } },
  async call(input, context) {
    await requirePrototypePreviewSession(getJiangxiaEnvValue('EXPERT_SESSION_ID'))
    const data = await renderPrototypePreview({ workDir: getCwd(), fidelity: input.fidelity, screenId: input.screenId, signal: context.abortController.signal })
    return { data }
  },
})
