import type { Tool } from '../../Tool.js'

export function isVerifyPlanExecutionToolAvailable(): false { return false }
export function getVerifyPlanExecutionTool(): Tool {
  throw new Error('Plan execution verification tool is unavailable in this build; remove CLAUDE_CODE_VERIFY_PLAN=true or install a reviewed implementation')
}
