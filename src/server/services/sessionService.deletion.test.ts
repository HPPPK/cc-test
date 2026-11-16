import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { SessionService } from './sessionService.js'

describe('legacy session deletion compatibility', () => {
  let configDir: string
  let originalConfigDir: string | undefined
  let service: SessionService
  const uuid = 'a1111111-1111-4111-8111-111111111111'
  const legacyId = `restored-workflow-answer-${uuid}`

  beforeEach(async () => {
    originalConfigDir = process.env.CLAUDE_CONFIG_DIR
    configDir = await fs.mkdtemp(path.join(os.tmpdir(), 'session-deletion-'))
    process.env.CLAUDE_CONFIG_DIR = configDir
    service = new SessionService()
  })

  afterEach(async () => {
    if (originalConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR
    else process.env.CLAUDE_CONFIG_DIR = originalConfigDir
    await fs.rm(configDir, { recursive: true, force: true })
  })

  async function fixture(id: string, project = '-fixture') {
    const dir = path.join(configDir, 'projects', project)
    await fs.mkdir(dir, { recursive: true })
    const file = path.join(dir, `${id}.jsonl`)
    const content = JSON.stringify({ type: 'session-meta', workDir: configDir, futureField: { keep: true } }) + '\n'
      + JSON.stringify({ type: 'user', uuid: 'message-1', timestamp: '2026-01-01T00:00:00Z', message: { role: 'user', content: 'Saved conversation' } }) + '\n'
    await fs.writeFile(file, content)
    return { file, content }
  }

  it('reads and deletes listed legacy IDs without rewriting old transcripts or unrelated sessions', async () => {
    const old = await fixture(legacyId)
    const peer = await fixture(uuid)
    expect((await service.listSessions()).sessions.map((s) => s.id)).toContain(legacyId)
    expect((await service.getSession(legacyId))?.id).toBe(legacyId)
    expect(await fs.readFile(old.file, 'utf8')).toBe(old.content)
    await service.deleteSession(legacyId)
    expect(await Bun.file(old.file).exists()).toBe(false)
    expect(await fs.readFile(peer.file, 'utf8')).toBe(peer.content)
    expect((await service.listSessions()).sessions.map((s) => s.id)).not.toContain(legacyId)
  })

  it('deletes every transcript of a logical session across project directories', async () => {
    const first = await fixture(uuid, '-first')
    const second = await fixture(uuid, '-second')
    const peer = await fixture(legacyId, '-second')
    await service.deleteSession(uuid)
    expect(await Bun.file(first.file).exists()).toBe(false)
    expect(await Bun.file(second.file).exists()).toBe(false)
    expect(await fs.readFile(peer.file, 'utf8')).toBe(peer.content)
  })

  it('rejects unsafe names consistently in listing, reading and deletion', async () => {
    const outside = path.join(configDir, 'outside.jsonl')
    await fs.writeFile(outside, 'protected')
    for (const id of ['../outside', '..\\outside', 'bad.name', '%2e%2e', '__proto__', 'constructor', 'x'.repeat(256)]) {
      expect(await service.findSessionFile(id)).toBeNull()
      await expect(service.deleteSession(id)).rejects.toThrow('Session not found')
    }
    await fixture('bad.name')
    await fixture('__proto__')
    await fs.mkdir(path.join(configDir, 'projects', '-fixture', 'directory.jsonl'))
    expect((await service.listSessions()).sessions).toHaveLength(0)
    expect(await fs.readFile(outside, 'utf8')).toBe('protected')
  })

  it('deduplicates batch IDs and reports missing sessions without false success', async () => {
    await fixture(legacyId)
    await fixture(uuid)
    const result = await service.deleteSessions([legacyId, uuid, legacyId, 'missing-session'])
    expect(result.successes).toEqual([legacyId, uuid])
    expect(result.failures).toHaveLength(1)
    expect(result.failures[0]?.sessionId).toBe('missing-session')
    expect((await service.listSessions()).sessions).toHaveLength(0)
  })

  it('skips a transcript that disappears between discovery and inspection', async () => {
    const vanished = await fixture(legacyId)
    await fixture(uuid)
    const lstat = fs.lstat
    const inspect = spyOn(fs, 'lstat').mockImplementation((async (file: Parameters<typeof fs.lstat>[0]) => {
      if (file === vanished.file) throw Object.assign(new Error('removed concurrently'), { code: 'ENOENT' })
      return lstat(file)
    }) as typeof fs.lstat)
    try {
      expect((await service.listSessions()).sessions.map((s) => s.id)).toEqual([uuid])
    } finally {
      inspect.mockRestore()
    }
  })

  it.skipIf(process.platform === 'win32')('does not follow transcript or project symlinks outside the history directory', async () => {
    const outsideDir = path.join(configDir, 'outside')
    await fs.mkdir(outsideDir)
    const outside = path.join(outsideDir, `${uuid}.jsonl`)
    await fs.writeFile(outside, 'protected')
    const project = path.join(configDir, 'projects', '-fixture')
    await fs.mkdir(project, { recursive: true })
    await fs.symlink(outside, path.join(project, `${uuid}.jsonl`))
    await fs.symlink(outsideDir, path.join(configDir, 'projects', '-linked-project'), 'dir')
    expect((await service.listSessions()).sessions).toHaveLength(0)
    expect(await service.findSessionFile(uuid)).toBeNull()
    await expect(service.deleteSession(uuid)).rejects.toThrow('Session not found')
    expect(await fs.readFile(outside, 'utf8')).toBe('protected')
  })
})
