import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { sessionService } from './sessionService.js'
const roots: string[] = []
const oldConfig = process.env.CLAUDE_CONFIG_DIR
const row = (type: string, content: unknown, extra = {}) => ({ type, uuid: crypto.randomUUID(), timestamp: '2026-11-10T11:00:00Z', message: { role: type, content }, ...extra })
async function fixture(children: unknown[], options: { artifact?: string; symlink?: boolean } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'agent-result-')); roots.push(root)
  process.env.CLAUDE_CONFIG_DIR = root
  const workspace = path.join(root, 'workspace'); await mkdir(workspace)
  const project = path.join(root, 'projects', '-fixture'); await mkdir(path.join(project, 'session', 'subagents'), { recursive: true })
  await writeFile(path.join(project, 'session.jsonl'), [
    { type: 'session-meta', workDir: workspace, isMeta: true },
    row('assistant', [{ type: 'tool_use', id: 'call', name: 'Agent', input: {} }]),
    row('user', [{ type: 'tool_result', tool_use_id: 'call', content: 'Async agent launched successfully.\nagentId: worker' }]),
  ].map((value) => JSON.stringify(value)).join('\n'))
  if (options.artifact) await writeFile(path.join(workspace, 'result.md'), options.artifact)
  if (options.symlink) { await writeFile(path.join(root, 'secret.md'), 'SECRET'); await symlink(path.join(root, 'secret.md'), path.join(workspace, 'result.md')) }
  await writeFile(path.join(project, 'session', 'subagents', 'agent-worker.jsonl'), children.map((value) => JSON.stringify(value)).join('\n'))
  return workspace
}
afterEach(async () => { process.env.CLAUDE_CONFIG_DIR = oldConfig; for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
const write = row('assistant', [{ type: 'tool_use', id: 'write', name: 'Write', input: { file_path: 'result.md' } }])
const receipt = row('user', [{ type: 'tool_result', tool_use_id: 'write', content: 'saved' }])
test('reads only successful bound workspace artifacts and keeps content out of model receipts', async () => {
  await fixture([write, receipt, row('assistant', [{ type: 'text', text: '已保存' }])], { artifact: '# 实际结果' })
  expect(await sessionService.getAgentResult('session', 'call')).toMatchObject({ status: 'available', content: '# 实际结果', source: 'artifact' })
})
test('shows actual final interruption reason when the worker never wrote an artifact', async () => {
  await fixture([row('assistant', [{ type: 'text', text: '未写入；Google 人工验证待处理，研究暂停。' }])])
  expect(await sessionService.getAgentResult('session', 'call')).toMatchObject({ status: 'available', source: 'transcript', content: '未写入；Google 人工验证待处理，研究暂停。' })
})
test('does not expose failed writes, symlinks outside workspace, unknown calls or intermediate reasoning', async () => {
  await fixture([write, receipt, row('assistant', [{ type: 'tool_use', id: 'read', name: 'Read', input: {} }])], { symlink: true })
  expect(await sessionService.getAgentResult('session', 'call')).toEqual({ status: 'missing', content: '' })
  expect(await sessionService.getAgentResult('session', 'foreign')).toEqual({ status: 'missing', content: '' })
  expect(await sessionService.getAgentResult('session', '../worker')).toEqual({ status: 'missing', content: '' })
})
test('does not promote denied writes even if a file exists', async () => {
  await fixture([write, row('user', [{ type: 'tool_result', tool_use_id: 'write', is_error: true, content: 'denied' }])], { artifact: 'unrelated file' })
  expect(await sessionService.getAgentResult('session', 'call')).toEqual({ status: 'missing', content: '' })
})


test('does not read a successful write outside the session workspace', async () => {
  const outsideWrite = row('assistant', [{ type: 'tool_use', id: 'write', name: 'Write', input: { file_path: '../secret.md' } }])
  const workspace = await fixture([outsideWrite, receipt])
  await writeFile(path.join(workspace, '..', 'secret.md'), 'OUTSIDE')
  expect(await sessionService.getAgentResult('session', 'call')).toEqual({ status: 'missing', content: '' })
})
test('does not read a symlinked subagent transcript from outside the bound session', async () => {
  await fixture([row('assistant', [{ type: 'text', text: 'private transcript' }])])
  const root = roots.at(-1)!
  const transcript = path.join(root, 'projects', '-fixture', 'session', 'subagents', 'agent-worker.jsonl')
  await rm(transcript)
  const other = path.join(root, 'other.jsonl')
  await writeFile(other, JSON.stringify(row('assistant', [{ type: 'text', text: 'SECRET' }])))
  await symlink(other, transcript)
  expect(await sessionService.getAgentResult('session', 'call')).toEqual({ status: 'missing', content: '' })
})
test('a missing previously written artifact falls back to a labeled final response', async () => {
  await fixture([write, receipt, row('assistant', [{ type: 'text', text: '已写入 result.md' }])])
  expect(await sessionService.getAgentResult('session', 'call')).toEqual({ status: 'available', source: 'transcript', content: '已写入 result.md' })
})
test('does not display thinking-only or receipt-only terminal messages as output', async () => {
  await fixture([row('assistant', [{ type: 'thinking', thinking: 'private reasoning' }])])
  expect(await sessionService.getAgentResult('session', 'call')).toEqual({ status: 'missing', content: '' })
})
