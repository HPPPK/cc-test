/** These tools cannot begin public research and are already exempt server-side.
 * In particular, delivering a saved answer must not depend on another HTTP call. */
export const EXPERT_INTAKE_SCOPE_TOOL_NAME = 'assess_expert_research_scope'
export function isExpertIntakeLocalTool(toolName: string): boolean {
  return ['Read', 'AskUserQuestion', EXPERT_INTAKE_SCOPE_TOOL_NAME, 'Skill'].includes(toolName)
}
