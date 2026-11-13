import type { Tool } from '../../Tool.js'

export function isSuggestBackgroundPRToolAvailable(): false { return false }
export function getSuggestBackgroundPRTool(): Tool {
  throw new Error('Internal background PR suggestion tool is unavailable in this build; USER_TYPE=ant does not install its implementation')
}
