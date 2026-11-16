import { expect, test } from 'bun:test'
import { getREPLTool, isREPLToolAvailable } from './REPLTool/REPLTool.js'
import { getSuggestBackgroundPRTool, isSuggestBackgroundPRToolAvailable } from './SuggestBackgroundPRTool/SuggestBackgroundPRTool.js'
import { getVerifyPlanExecutionTool, isVerifyPlanExecutionToolAvailable } from './VerifyPlanExecutionTool/VerifyPlanExecutionTool.js'

test.each([
  ['USER_TYPE', 'ant', isREPLToolAvailable, getREPLTool],
  ['USER_TYPE', 'ant', isSuggestBackgroundPRToolAvailable, getSuggestBackgroundPRTool],
  ['CLAUDE_CODE_VERIFY_PLAN', 'true', isVerifyPlanExecutionToolAvailable, getVerifyPlanExecutionTool],
] as const)('forced optional tool %s=%s fails explicitly without executing a tool', (key, value, available, getTool) => {
  const old = process.env[key]
  try {
    process.env[key] = value
    expect(available()).toBe(false)
    expect(() => getTool()).toThrow('unavailable')
  } finally {
    if (old === undefined) delete process.env[key]
    else process.env[key] = old
  }
})
