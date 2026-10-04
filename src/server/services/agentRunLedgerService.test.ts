import { afterEach, describe, expect, test } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { AgentRunLedgerService } from './agentRunLedgerService.js'

const tempDirs: string[] = []
afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })))
})

async function createService() {
  const configDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-run-ledger-'))
  tempDirs.push(configDir)
  return new AgentRunLedgerService({ configDir })
}

describe('AgentRunLedgerService', () => {
  test('records tool, Skill and artifact receipts idempotently without storing delivery keys', async () => {
    const service = await createService()
    const started = await service.appendEvent({
      sessionId: 'session-1', runId: 'run-1', eventType: 'tool_started', toolUseId: 'tool-1', toolName: 'Playwright',
    })
    const withSkill = await service.appendEvent({
      sessionId: 'session-1', runId: 'run-1', eventType: 'skill_invoked', toolUseId: 'tool-1', toolName: 'Skill', skillId: 'taste-redesign',
    })
    const withArtifact = await service.appendEvent({
      sessionId: 'session-1', runId: 'run-1', eventType: 'artifact_recorded', toolUseId: 'tool-1', toolName: 'Playwright',
      artifact: { kind: 'screenshot', path: 'C:/workspace/output/qa.png', sourceTool: 'Playwright' },
    })
    const duplicate = await service.appendEvent({
      sessionId: 'session-1', runId: 'run-1', eventType: 'artifact_recorded', toolUseId: 'tool-1', toolName: 'Playwright',
      artifact: { kind: 'screenshot', path: 'C:/workspace/output/qa.png', sourceTool: 'Playwright' },
    })

    expect(started.events.map((event) => event.type)).toEqual(['run_started', 'tool_started'])
    expect(withSkill.events.some((event) => event.skillId === 'taste-redesign')).toBe(true)
    expect(withArtifact.artifacts).toHaveLength(1)
    expect(duplicate.events).toHaveLength(withArtifact.events.length)
    expect(duplicate.events.some((event) => 'idempotencyKey' in event)).toBe(false)
  })

  test('changes status, preserves unknown future fields, and lists compact run summaries', async () => {
    const service = await createService()
    await service.appendEvent({ sessionId: 'session-2', runId: 'run-a', eventType: 'tool_started', toolUseId: 'tool-a', toolName: 'AskUserQuestion' })
    const filePath = service.getRunPath('session-2', 'run-a')
    const raw = JSON.parse(await fs.readFile(filePath, 'utf8')) as Record<string, unknown>
    raw.futureLedgerField = { keep: true }
    await fs.writeFile(filePath, JSON.stringify(raw), 'utf8')

    const completed = await service.appendEvent({
      sessionId: 'session-2', runId: 'run-a', eventType: 'tool_completed', toolUseId: 'tool-a', toolName: 'AskUserQuestion', status: 'waiting_user',
    })
    const persisted = JSON.parse(await fs.readFile(filePath, 'utf8')) as Record<string, unknown>
    const summaries = await service.listRuns('session-2')

    expect(completed.status).toBe('waiting_user')
    expect(completed).not.toHaveProperty('futureLedgerField')
    expect(persisted.futureLedgerField).toEqual({ keep: true })
    expect(summaries).toEqual([expect.objectContaining({ runId: 'run-a', sessionId: 'session-2', status: 'waiting_user', eventCount: 3 })])
  })

  test('rejects traversal-shaped session identifiers', async () => {
    const service = await createService()
    await expect(service.appendEvent({
      sessionId: '../outside', runId: 'run-1', eventType: 'tool_started', toolUseId: 'tool-1', toolName: 'Read',
    })).rejects.toThrow('Invalid Agent Run session id.')
  })
})
