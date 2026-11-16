import { expect, test } from 'bun:test'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sessionService } from './sessionService.js'

test('runtime recovery reads authentication errors from internal turns without changing the visible transcript', async () => {
  const root = await mkdtemp(join(tmpdir(), 'runtime-auth-'))
  const original = process.env.CLAUDE_CONFIG_DIR
  process.env.CLAUDE_CONFIG_DIR = root
  try {
    const project = join(root, 'projects', '-runtime-auth')
    await mkdir(project, { recursive: true })
    const id = crypto.randomUUID()
    const rows = [
      { type: 'user', uuid: 'human', messageKind: 'user_input', message: { role: 'user', content: 'research' } },
      { type: 'user', uuid: 'internal', parentUuid: 'human', messageKind: 'internal_notification', message: { role: 'user', content: '<expert-research-quality-recovery>continue</expert-research-quality-recovery>' } },
      { type: 'assistant', uuid: 'failure', parentUuid: 'internal', error: 'authentication_failed', message: { role: 'assistant', content: [{ type: 'text', text: 'Failed to authenticate. API Error: 403 access denied' }] } },
    ].map(row => ({ ...row, sessionId: id, cwd: root, timestamp: new Date().toISOString() }))
    await writeFile(join(project, id + '.jsonl'), rows.map(row => JSON.stringify(row)).join('\n') + '\n')
    const runtime = await sessionService.getSessionRuntimeMessages(id)
    expect(runtime.find(message => message.id === 'failure')?.content).toEqual(rows[2]!.message.content)
    expect(runtime.find(message => message.id === 'internal')?.isHumanInput).toBe(false)
    expect(runtime.find(message => message.id === 'human')?.isHumanInput).toBe(true)
  } finally {
    if (original === undefined) delete process.env.CLAUDE_CONFIG_DIR
    else process.env.CLAUDE_CONFIG_DIR = original
    await rm(root, { recursive: true, force: true })
  }
})
