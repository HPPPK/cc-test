import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test'
import { mkdtemp, mkdir, writeFile, rm, appendFile, unlink } from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { handleSessionsApi } from '../api/sessions.js'
import { sessionService } from '../services/sessionService.js'
import { WorkflowSessionStateService } from '../services/workflowSessionStateService.js'
import type { WorkflowSessionState } from '../services/workflowTypes.js'
import { enqueueWorkflowSessionTransition } from '../services/workflowTransitionCoordinator.js'

let root: string
let previous: string | undefined
const sid = 'workflow-fast-state-fixture'
let transcript: string
beforeEach(async () => {
  previous = process.env.CLAUDE_CONFIG_DIR
  root = await mkdtemp(path.join(os.tmpdir(), 'workflow-fast-read-'))
  process.env.CLAUDE_CONFIG_DIR = root
  const dir = path.join(root, 'projects', 'owned-project')
  await mkdir(dir, { recursive: true })
  transcript = path.join(dir, sid + '.jsonl')
  await writeFile(transcript, JSON.stringify({ type: 'session-meta', workDir: root, workflow: { mode: 'workflow', activePhaseId: 'current', sourceTemplateStatus: 'current', stateRevision: 17 } }) + '\n')
  const now = new Date().toISOString()
  const state: WorkflowSessionState = {
    schemaVersion: 1, sessionId: sid, mode: 'workflow', template: { id: 'custom', version: '1', source: 'user', snapshotId: 'fixture', sourceState: 'current' },
    templateIdentity: { id: 'custom', version: '1', source: 'user' }, sourceTemplateStatus: 'current', status: 'running', workflowStatus: 'running', runStatus: 'active', activePhaseId: 'current',
    phases: [{ id: 'current', index: 0, status: 'running', artifactPointers: [] }], phaseRuns: [], transitionHistory: [], artifactIndex: [], finalReportRef: null,
    stateVersion: 17, revision: 17, createdAt: now, updatedAt: now,
    runtimeContract: { schemaVersion: 1, migrationStatus: 'current', audit: [], phaseStates: { current: {
      phaseId: 'current', workStatus: 'in-progress', eligibility: 'ineligible', blockerReasons: [], issues: [], artifactRequirements: [], checks: [], taskSnapshots: [], evaluatedAt: now,
    } } },
  }
  await new WorkflowSessionStateService().writeState(sid, state)
})
afterEach(async () => {
  if (previous === undefined) delete process.env.CLAUDE_CONFIG_DIR
  else process.env.CLAUDE_CONFIG_DIR = previous
  await rm(root, { recursive: true, force: true })
})
const get = (id = sid) => {
  const url = new URL(`http://127.0.0.1/api/sessions/${id}/workflow`)
  return handleSessionsApi(new Request(url), url, ['api', 'sessions', id, 'workflow'])
}

test('workflow GET reads current durable authority without full chat/subagent projection', async () => {
  const full = spyOn(sessionService, 'getSession').mockRejectedValue(new Error('Full transcript projection must not run on the workflow guard path'))
  try {
    const first = await get()
    expect(first.status).toBe(200)
    const payload = await first.json()
    expect(Object.keys(payload).sort()).toEqual(['state', 'workflow'])
    expect(payload.state.stateVersion).toBe(17)
    await new WorkflowSessionStateService().updateState(sid, current => ({ ...current, runStatus: 'paused' }))
    const second = await get()
    expect(second.status).toBe(200)
    const state = (await second.json()).state
    expect(state.runStatus).toBe('paused')
    expect(state.stateVersion).toBeGreaterThan(17)
    expect(full).not.toHaveBeenCalled()
  } finally { full.mockRestore() }
})

test('diagnostic timing distinguishes serialized queue wait without recording response contents', async () => {
  const originalFlag = process.env.CC_JIANGXIA_WORKFLOW_STATE_TIMING
  process.env.CC_JIANGXIA_WORKFLOW_STATE_TIMING = '1'
  const records: string[] = []
  const log = spyOn(console, 'info').mockImplementation((...args) => { if (args[0] === '[WorkflowStateReadTiming]') records.push(String(args[1])) })
  let release: () => void = () => {}
  const held = enqueueWorkflowSessionTransition(sid, () => new Promise<void>(resolve => { release = resolve }))
  const metadata = sessionService.getWorkflowSessionMetadata.bind(sessionService)
  let metadataRead = false
  const read = spyOn(sessionService, 'getWorkflowSessionMetadata').mockImplementation(async id => { const result = await metadata(id); metadataRead = true; return result })
  try {
    const pending = get()
    const deadline = Date.now() + 5000
    while (!metadataRead && Date.now() < deadline) await Bun.sleep(5)
    expect(metadataRead).toBe(true)
    await Bun.sleep(30)
    release(); await held
    expect((await pending).status).toBe(200)
    expect(records).toHaveLength(1)
    const record = JSON.parse(records[0]!)
    expect(record.stagesMs.queueWait).toBeGreaterThanOrEqual(20)
    expect(Object.keys(record.stagesMs).sort()).toEqual(['metadata', 'queueWait', 'reconcile', 'serialization', 'stateRead'])
    expect(records[0]).not.toContain(sid)
    expect(records[0]).not.toContain('stateVersion')
  } finally {
    release(); await held
    log.mockRestore(); read.mockRestore()
    if (originalFlag === undefined) delete process.env.CC_JIANGXIA_WORKFLOW_STATE_TIMING
    else process.env.CC_JIANGXIA_WORKFLOW_STATE_TIMING = originalFlag
  }
})

test('retains session ownership, explicit exit, deleted session and durable-state checks', async () => {
  expect((await get('another-session')).status).toBe(404)
  await appendFile(transcript, '{"type":"session-meta","workflow":null}\n')
  expect((await get()).status).toBe(409)
  await unlink(transcript)
  expect((await get()).status).toBe(404)
})
