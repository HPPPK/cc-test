import type { Tool } from '../../Tool.js'

/** Internal REPL execution is not distributed in the public source tree. */
export function isREPLToolAvailable(): false { return false }
export function getREPLTool(): Tool {
  throw new Error('Internal REPL tool is unavailable in this build; USER_TYPE=ant does not install its implementation')
}
