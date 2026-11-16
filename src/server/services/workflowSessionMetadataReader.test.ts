import { afterEach, beforeEach, expect, test } from 'bun:test'
import { mkdtemp, mkdir, writeFile, rm, utimes, unlink } from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { SessionService } from './sessionService.js'
import { readWorkflowSessionMetadata } from './workflowSessionMetadataReader.js'
import type { WorkflowSessionMetadata } from './workflowTypes.js'

let root: string
let previous: string | undefined
const sid = 'workflow-metadata-fixture'
const workflow = {
  mode: 'workflow', schemaVersion: 1, templateId: 'fixture', templateSource: 'user', templateVersion: '1',
  templateSnapshotId: 'fixture-snapshot', workflowStatus: 'running', activePhaseId: 'current', stateRevision: 4,
  statePointer: { kind: 'workflow-state', sessionId: sid, artifactId: 'state', schemaVersion: 1, createdAt: '2026-11-16T00:00:00.000Z' },
  updatedAt: '2026-11-16T00:00:00.000Z',
} satisfies WorkflowSessionMetadata
const metadata = (value: unknown) => JSON.stringify({ type: 'session-meta', workDir: 'C:/fixture', workflow: value })
async function transcript(content: string, project = 'project-a') {
  const dir = path.join(root, 'projects', project)
  await mkdir(dir, { recursive: true })
  const file = path.join(dir, sid + '.jsonl')
  await writeFile(file, content, 'utf8')
  return file
}
beforeEach(async () => { previous = process.env.CLAUDE_CONFIG_DIR; root = await mkdtemp(path.join(os.tmpdir(), 'workflow-metadata-')); process.env.CLAUDE_CONFIG_DIR = root })
afterEach(async () => { if (previous === undefined) delete process.env.CLAUDE_CONFIG_DIR; else process.env.CLAUDE_CONFIG_DIR = previous; await rm(root, { recursive: true, force: true }) })

test('reads latest workflow metadata without transcript or subagent projection and matches getSession', async () => {
  const file = await transcript(metadata({ ...workflow, stateRevision: 1 }) + '\n' + JSON.stringify({ type: 'assistant', message: { content: 'large body '.repeat(100_000) } }) + '\n' + metadata(workflow) + '\n')
  expect(await readWorkflowSessionMetadata(file)).toEqual({ workflow })
  const service = new SessionService()
  expect((await service.getWorkflowSessionMetadata(sid))?.workflow).toEqual((await service.getSession(sid))?.workflow)
})

test.each([null, { mode: 'chat' }, false])('an explicit workflow exit (%j) never revives earlier workflow metadata', async value => {
  const file = await transcript(metadata(workflow) + '\n' + metadata(value) + '\n')
  expect(await readWorkflowSessionMetadata(file)).toEqual({})
  expect((await new SessionService().getSession(sid))?.workflow).toBeUndefined()
})

test('skips absent workflow fields and malformed or partially appended tail lines', async () => {
  const file = await transcript(metadata(workflow) + '\n{"type":"session-meta","title":"new title"}\nnot-json\n{"type":"session-meta","workflow":')
  expect(await readWorkflowSessionMetadata(file)).toEqual({ workflow })
})

test('uses ordinary JSON last-key semantics without interpreting nested type fields as metadata', async () => {
  const file = await transcript(metadata(workflow) + '\n{"type":"assistant","type":"session-meta","workflow":null}\n')
  expect(await readWorkflowSessionMetadata(file)).toEqual({})
  await writeFile(file, metadata(workflow) + '\n{"message":{"type":"session-meta","workflow":null},"type":"assistant"}\n')
  expect(await readWorkflowSessionMetadata(file)).toEqual({ workflow })
})

test('decodes whole UTF-8 metadata ranges across blocks, CRLF and BOM with nonstandard key order', async () => {
  const chinese = '确认学生管理范围'.repeat(20_000)
  const value = { ...workflow, chinese }
  const file = await transcript('\uFEFF' + JSON.stringify({ padding: chinese, workflow: value, type: 'session-meta' }) + '\r\n' + JSON.stringify({ type: 'assistant', message: { content: '下一步' } }) + '\r\n')
  expect(await readWorkflowSessionMetadata(file)).toEqual({ workflow: value })
})

test('skips giant message lines, including late type keys and metadata-looking strings', async () => {
  const message = JSON.stringify({ message: { content: '"type":"session-meta" '.repeat(500_000) }, type: 'assistant' })
  const file = await transcript(metadata(workflow) + '\n' + message + '\n')
  expect(await readWorkflowSessionMetadata(file)).toEqual({ workflow })
})

test('oversized real metadata fails closed instead of falling back to an older workflow', async () => {
  const file = await transcript(metadata(workflow) + '\n' + JSON.stringify({ type: 'session-meta', padding: 'x'.repeat(8 * 1024 * 1024), workflow: null }))
  await expect(readWorkflowSessionMetadata(file)).rejects.toThrow('8 MiB')
})

test('retains duplicate-project newest-file ownership and refuses deleted or another SID/profile', async () => {
  const first = await transcript(metadata(workflow), 'project-a')
  const second = await transcript(metadata({ ...workflow, stateRevision: 9 }), 'project-b')
  await utimes(first, new Date(1000), new Date(1000))
  await utimes(second, new Date(2000), new Date(2000))
  const service = new SessionService()
  expect((await service.getWorkflowSessionMetadata(sid))?.workflow).toMatchObject({ stateRevision: 9 })
  expect(await service.getWorkflowSessionMetadata('another-session')).toBeNull()
  await unlink(first); await unlink(second)
  expect(await service.getWorkflowSessionMetadata(sid)).toBeNull()
  process.env.CLAUDE_CONFIG_DIR = path.join(root, 'other-profile')
  expect(await service.getWorkflowSessionMetadata(sid)).toBeNull()
})
