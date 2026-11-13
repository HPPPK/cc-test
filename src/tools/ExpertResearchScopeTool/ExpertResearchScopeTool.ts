import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { researchIntakeAssessmentSchema, INTAKE_TOOL_NAME } from '../../server/services/expertResearchIntakeService.js'
import { requestExpertIntake } from '../../services/tools/expertResearchIntakeRuntime.js'
import { getJiangxiaEnvValue } from '../../utils/appIdentity.js'
const inputSchema = z.strictObject({
  action: z.enum(['inspect', 'assess']).describe('Inspect genuine human message IDs/text and persisted scope; then assess only consequential unknown user-owned preferences. Read supplied materials first when helpful.'),
  assessment: researchIntakeAssessmentSchema.optional().describe('Required for assess. Cite exact real human message IDs and quotes for confirmed/delegated boundaries; unknown requires userOwnedReason and materialImpact. This is a semantic assessment, not a fixed question bank. Known business defaults require exact evidence from inspect businessRules using messageId active-business-rules and cannot invent the core task.'),
})
type InputSchema = typeof inputSchema
export const ExpertResearchScopeTool = buildTool({
  name: INTAKE_TOOL_NAME,
  maxResultSizeChars: 100_000,
  async description() { return 'Assess commercialization scope before research. Missing consequential user-owned preferences require dynamic AskUserQuestion cards; actual answers are recorded by the server, never claim readiness yourself.' },
  async prompt() { return 'Use inspect to obtain actual human evidence IDs. Assess coreTask, audience and deliveryBoundary with provenance confirmed, known-business-default, unknown or explicitly-delegated. deliveryBoundary describes the proposed product platform/environment, not the report format or requested analysis deliverable. If an unresolved environment or concrete task changes competitors or compatibility, ask that consequential choice; reuse supplied facts and allow explicit delegated exploration. These are reasoning boundaries, not mandatory user questions. Use the active editable business rules from inspect; explicit user instructions and supplied rules take precedence. When unknown, ask only unresolved decisions in a small dynamic AskUserQuestion group with matching dimension IDs; offer delegate only as explicit exploration. Do not ask known facts again. Do not put answers in model tool input. After an actual answer the host admits or keeps remaining decisions pending. Inspect nextAction and canonical state.dimensions: if continue_research and requiresAssessment:false, continue without reassessing. Card requestId/toolUseId are not human evidence messageId. A repeated assess without new human input retains canonical scope, never overwrites actual answers.' },
  inputSchema,
  isEnabled() { return getJiangxiaEnvValue('EXPERT_TEMPLATE_FILL_DELIVERY') === 'cli-only' },
  isConcurrencySafe() { return false },
  isReadOnly() { return false },
  userFacingName() { return '梳理调研范围' },
  async checkPermissions(input) { return { behavior: 'allow' as const, updatedInput: input } },
  renderToolUseMessage() { return null },
  renderToolResultMessage() { return null },
  async call(input, context) {
    if (context.agentId) throw new Error('EXPERT_INTAKE_REQUIRED: Scope assessment belongs to the main session only.')
    if (input.action === 'assess' && !input.assessment) throw new Error('Scope assessment is required.')
    return { data: await requestExpertIntake('scope-assessment', input) }
  },
  mapToolResultToToolResultBlockParam(data, id) { return { type: 'tool_result' as const, tool_use_id: id, content: JSON.stringify(data) } },
} satisfies ToolDef<InputSchema, any>)
