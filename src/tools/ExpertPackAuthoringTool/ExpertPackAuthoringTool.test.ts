import { customToolSchemaFixture, toolPromptFixture } from '../toolFixtures.test.js'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import type { Tool } from '../../Tool.js'
import { findToolByName, getEmptyToolPermissionContext } from '../../Tool.js'
import { getAllBaseTools, getTools } from '../../tools.js'
import { getExpertPackStorageDir, resetExpertPackRegistryForTests } from '../../server/services/expertPackRegistryService.js'
import { ZipPackAdapter } from '../../server/services/zipPackAdapter.js'
import { toolToAPISchema } from '../../utils/api.js'
import { clearToolSchemaCache } from '../../utils/toolSchemaCache.js'

const adapter = new ZipPackAdapter()
const originalConfigDir = process.env.CLAUDE_CONFIG_DIR
const originalDesktopServerUrl = process.env.CC_JIANGXIA_DESKTOP_SERVER_URL
const originalAnthropicApiKey = process.env.ANTHROPIC_API_KEY
let tempConfigDir = ''

function candidate(id = 'tool-authored-expert') {
  return {
    packId: id,
    name: 'Tool Authored Expert',
    version: '1.0.0',
    description: 'An Expert ZIP created by the tool test.',
    expert: {
      id,
      name: 'Tool Authored Expert',
      systemPromptContent: 'You are the tool-authored Expert.',
    },
  }
}

async function loadTool(): Promise<NonNullable<typeof import('./ExpertPackAuthoringTool.js')['ExpertPackAuthoringTool']>> {
  const mod = await import('./ExpertPackAuthoringTool.js')
  expect(mod.ExpertPackAuthoringTool).toBeDefined()
  if (!mod.ExpertPackAuthoringTool) throw new Error('ExpertPackAuthoringTool export is required')
  return mod.ExpertPackAuthoringTool
}

beforeEach(async () => {
  tempConfigDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-jiangxia-expert-authoring-tool-'))
  process.env.CLAUDE_CONFIG_DIR = tempConfigDir
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test-expert-authoring-tool-pool'
  delete process.env.CC_JIANGXIA_DESKTOP_SERVER_URL
  resetExpertPackRegistryForTests()
  clearToolSchemaCache()
})

afterEach(async () => {
  resetExpertPackRegistryForTests()
  clearToolSchemaCache()
  if (originalConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR
  else process.env.CLAUDE_CONFIG_DIR = originalConfigDir
  if (originalDesktopServerUrl === undefined) delete process.env.CC_JIANGXIA_DESKTOP_SERVER_URL
  else process.env.CC_JIANGXIA_DESKTOP_SERVER_URL = originalDesktopServerUrl
  if (originalAnthropicApiKey === undefined) delete process.env.ANTHROPIC_API_KEY
  else process.env.ANTHROPIC_API_KEY = originalAnthropicApiKey
  await fs.rm(tempConfigDir, { recursive: true, force: true })
})

describe('ExpertPackAuthoringTool', () => {
  test('is globally registered with an API-safe object-root schema', async () => {
    const tool = await loadTool()
    expect(tool.name).toBe('expert_pack_authoring')
    expect(findToolByName(getAllBaseTools(), 'expert_pack_authoring')).toBe(tool)
    expect(findToolByName(getTools(getEmptyToolPermissionContext()), 'expert_pack_authoring')).toBe(tool)

    const apiSchema = customToolSchemaFixture(await toolToAPISchema(tool, {
      getToolPermissionContext: async () => getEmptyToolPermissionContext(),
      tools: [],
      agents: [],
    }))
    expect(apiSchema.input_schema).toMatchObject({ type: 'object' })
    expect(tool.inputSchema.safeParse({ operation: 'create', pack: candidate() }).success).toBe(true)
  })

  test('instructs generic Expert creation to remain detached from the workspace until explicit use', async () => {
    const tool = await loadTool()
    const prompt = await tool.prompt()

    expect(prompt).toContain('When the user asks only to create a general-purpose Expert, derive its ZIP only from the user-stated requirements.')
    expect(prompt).toContain('Do not inspect or read the current workspace, project directories, attachments, or unrelated files merely to author it.')
    expect(prompt).toContain('Do not automatically run the newly created Expert or analyze a directory after creation; do so only after the user explicitly asks to use it on a specified directory.')
    expect(prompt).toContain('After create, report the pack name, ID, and ZIP path instead of an unsolicited analysis.')
    expect(prompt).toContain("Use the create result's affectedPack.zipPath as the ZIP path; do not use filesystem tools to discover it.")
    expect(prompt).toContain('To add or replace a self-contained Skill during update, use patch.skills as [{ id, files: { "SKILL.md": "..." } }] and include the same id in patch.expert.skillIds.')
    expect(prompt).toContain('Never use Bash or direct filesystem writes to change an Expert ZIP; use this controlled update operation.')
  })

  test('uses the direct service path to validate, create, and list Expert ZIP packs', async () => {
    const tool = await loadTool()
    const call = tool.call.bind(tool) as any
    const validate = await call({ operation: 'validate', pack: candidate() }, {} as never, async () => ({ behavior: 'allow', updatedInput: {} }), {} as never)
    const create = await call({ operation: 'create', pack: candidate() }, {} as never, async () => ({ behavior: 'allow', updatedInput: {} }), {} as never)
    const list = await call({ operation: 'list' }, {} as never, async () => ({ behavior: 'allow', updatedInput: {} }), {} as never)

    expect(validate.data).toMatchObject({ operation: 'validate', status: 'validated', persisted: false })
    expect(create.data).toMatchObject({
      operation: 'create',
      status: 'succeeded',
      persisted: true,
      affectedPack: {
        packId: 'tool-authored-expert',
        zipPath: path.join(getExpertPackStorageDir(), 'tool-authored-expert.zip'),
      },
    })
    expect(list.data.packs).toEqual(expect.arrayContaining([expect.objectContaining({ packId: 'tool-authored-expert' })]))
    expect((tool.renderToolResultMessage as any)(create.data)).toContain('zipPath=' + path.join(getExpertPackStorageDir(), 'tool-authored-expert.zip'))
    await expect(fs.stat(path.join(getExpertPackStorageDir(), 'tool-authored-expert.zip'))).resolves.toBeDefined()
    await expect(fs.stat(path.join(tempConfigDir, 'cc-jiangxia', 'workflows', 'packs'))).rejects.toThrow()
  })

  test('writes a self-contained Skill through the authoring tool update into the persisted Expert ZIP', async () => {
    const tool = await loadTool()
    const call = tool.call.bind(tool) as any
    await call({ operation: 'create', pack: candidate() }, {} as never, async () => ({ behavior: 'allow', updatedInput: {} }), {} as never)
    const inspected = await call({ operation: 'inspect', packId: 'tool-authored-expert' }, {} as never, async () => ({ behavior: 'allow', updatedInput: {} }), {} as never)
    const basisHash = inspected.data.affectedPack?.basisHash
    expect(basisHash).toMatch(/^sha256:[a-f0-9]{64}$/)

    const updated = await call({
      operation: 'update',
      packId: 'tool-authored-expert',
      basisHash,
      patch: {
        expert: { id: 'tool-authored-expert', skillIds: ['project-analysis'] },
        skills: [{ id: 'project-analysis', files: { 'SKILL.md': '# Project analysis\n\nExplain the requested project.\n' } }],
      },
    }, {} as never, async () => ({ behavior: 'allow', updatedInput: {} }), {} as never)

    expect(updated.data).toMatchObject({ operation: 'update', status: 'succeeded', persisted: true })
    const zip = await adapter.read(new Uint8Array(await fs.readFile(path.join(getExpertPackStorageDir(), 'tool-authored-expert.zip'))))
    expect(await zip.readText('skills/project-analysis/SKILL.md')).toContain('Explain the requested project')
  })

  test('marks authoring reads as read-only and deletion as destructive', async () => {
    const tool = await loadTool()
    expect(tool.isReadOnly?.({ operation: 'guide' })).toBe(true)
    expect(tool.isReadOnly?.({ operation: 'validate', pack: candidate() })).toBe(true)
    expect(tool.isReadOnly?.({ operation: 'create', pack: candidate() })).toBe(false)
    expect(tool.isDestructive?.({ operation: 'delete', packId: 'tool-authored-expert', basisHash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' })).toBe(true)
  })

  test('posts to the separate desktop Expert authoring endpoint without direct writes', async () => {
    const requests: Array<{ method: string; pathname: string; body: Record<string, unknown> }> = []
    const server = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      async fetch(req) {
        requests.push({ method: req.method, pathname: new URL(req.url).pathname, body: await req.json() as Record<string, unknown> })
        return Response.json({ operation: 'create', status: 'succeeded', persisted: true, validation: { valid: true, issues: [] }, nextAction: 'none', message: 'Expert ZIP pack created.' })
      },
    })
    process.env.CC_JIANGXIA_DESKTOP_SERVER_URL = 'http://127.0.0.1:' + server.port
    try {
      const tool = await loadTool()
      const call = tool.call.bind(tool) as any
      const result = await call({ operation: 'create', pack: candidate('desktop-authored-expert') }, {} as never, async () => ({ behavior: 'allow', updatedInput: {} }), {} as never)
      expect(result.data).toMatchObject({ operation: 'create', status: 'succeeded', persisted: true })
      expect(requests).toEqual([expect.objectContaining({ method: 'POST', pathname: '/api/experts/packs/authoring', body: { operation: 'create', pack: candidate('desktop-authored-expert') } })])
      await expect(fs.stat(getExpertPackStorageDir())).rejects.toThrow()
    } finally {
      server.stop(true)
    }
  })
})
