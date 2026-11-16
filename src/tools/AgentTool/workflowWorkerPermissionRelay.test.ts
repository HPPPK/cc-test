import { expect, test } from 'bun:test'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { hasDesktopWorkflowPermissionRelay } from './workflowWorkerPermissionRelay.js'
import { createScopeAmendmentFixture } from '../../server/services/__fixtures__/workflowScopeAmendment.js'
import { createDevelopmentWorkerContract, type DevelopmentWorkerContract } from '../../server/services/developmentToolExecutionPolicy.js'

test('relay transport requires authoritative Desktop identity, current owner, role and exact scopes; QA/debug stay read-only', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'worker-relay-binding-'))
  const keys = ['CC_JIANGXIA_DESKTOP_SERVER_URL', 'CC_JIANGXIA_WORKFLOW_SESSION_ID'] as const
  const previous = keys.map(key => process.env[key])
  const { state } = await createScopeAmendmentFixture(root)
  state.runStatus = 'active'
  const slot = state.runtimeContract!.phaseStates['delegate-implement']!.taskSnapshots.find(task => task.batchId === 'B1' && task.workflowRole === 'coder')!
  slot.status = 'running'; slot.agentRunId = 'actual-worker'
  const worker: DevelopmentWorkerContract = { ...createDevelopmentWorkerContract(state, 'coder', root, 'B1', slot.writeScopes)!, agentId: 'actual-worker' }
  const server = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: () => Response.json({ state }) })
  process.env.CC_JIANGXIA_DESKTOP_SERVER_URL = `http://127.0.0.1:${server.port}`
  process.env.CC_JIANGXIA_WORKFLOW_SESSION_ID = state.sessionId
  const check = (contract = worker) => hasDesktopWorkflowPermissionRelay(contract, state, new AbortController().signal)
  try {
    expect(await check()).toBe(true)
    const templateId = state.templateIdentity.id
    for (const otherTemplate of ['stradn-managed-development-workflow-v1', 'feature-extension-workflow-v8', 'debug-repair-workflow-v8', 'custom']) {
      state.templateIdentity.id = otherTemplate
      expect(await check()).toBe(false)
    }
    state.templateIdentity.id = templateId
    for (const invalid of [
      { ...worker, sessionId: 'other-session' }, { ...worker, runId: 'old-run' }, { ...worker, phaseId: 'old-phase' },
      { ...worker, agentId: 'other-worker' }, { ...worker, writeScopes: ['**'] }, { ...worker, batchId: undefined },
      { ...worker, workspaceRoot: path.join(root, 'other') },
    ]) expect(await check(invalid)).toBe(false)
    const worktree = { ...worker, workspaceRoot: path.join(root, 'trusted-worktree') }
    expect(await hasDesktopWorkflowPermissionRelay(worktree, state, new AbortController().signal)).toBe(false)
    expect(await hasDesktopWorkflowPermissionRelay(worktree, state, new AbortController().signal, worktree.workspaceRoot)).toBe(true)
    state.runStatus = 'paused'; expect(await check()).toBe(false); state.runStatus = 'active'
    slot.status = 'blocked'; expect(await check()).toBe(false); slot.status = 'running'
    const qa = { ...worker, role: 'qa' as const, phaseId: 'scenario-review', batchId: undefined, writeScopes: [] }
    state.activePhaseId = 'scenario-review'
    expect(await hasDesktopWorkflowPermissionRelay(qa, state, new AbortController().signal)).toBe(true)
    expect(await hasDesktopWorkflowPermissionRelay({ ...qa, writeScopes: ['**'] }, state, new AbortController().signal)).toBe(false)
    state.activePhaseId = 'local-preview'
    expect(await hasDesktopWorkflowPermissionRelay({ ...qa, role: 'debug', phaseId: 'local-preview' }, state, new AbortController().signal)).toBe(true)
    delete process.env.CC_JIANGXIA_DESKTOP_SERVER_URL
    expect(await check()).toBe(false)
  } finally {
    server.stop(true)
    keys.forEach((key, i) => { if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i] })
    await fs.rm(root, { recursive: true, force: true })
  }
})
