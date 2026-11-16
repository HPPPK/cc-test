import { expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FileReadTool } from './FileReadTool.js'
import { getEmptyToolPermissionContext } from '../../Tool.js'
import { registerAgentBrowserResult, clearAgentBrowserResults } from '../AgentTool/expertWorkerRecovery.js'

test('the real Read permission boundary accepts an owned browser output and denies other workers and cleaned capabilities', async () => {
  const previousMacro = (globalThis as any).MACRO
  ;(globalThis as any).MACRO = { VERSION: 'test' }
  const directory = mkdtempSync(join(tmpdir(), 'read-browser-output-'))
  const file_path = join(directory, 'browser-call.txt')
  writeFileSync(file_path, 'full page result')
  const context = (agentId: string) => ({ agentId, agentType: 'expert-evidence-researcher', messages: [], getAppState: () => ({ toolPermissionContext: { ...getEmptyToolPermissionContext(), mode: 'bypassPermissions' } }) }) as any
  try {
    registerAgentBrowserResult('owner', directory, 'browser-call')
    expect((await FileReadTool.checkPermissions({ file_path }, context('owner'))).behavior).not.toBe('deny')
    expect((await FileReadTool.checkPermissions({ file_path }, context('other'))).behavior).toBe('deny')
    clearAgentBrowserResults('owner')
    expect((await FileReadTool.checkPermissions({ file_path }, context('owner'))).behavior).toBe('deny')
  } finally { if (previousMacro === undefined) delete (globalThis as any).MACRO; else (globalThis as any).MACRO = previousMacro; clearAgentBrowserResults('owner'); rmSync(directory, { recursive: true, force: true }) }
})
