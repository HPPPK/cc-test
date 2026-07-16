import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { ExpertRuntimeService } from './expertRuntimeService.js'
import { ExpertPackRegistryService, resetExpertPackRegistryForTests } from './expertPackRegistryService.js'
import { ZipPackAdapter } from './zipPackAdapter.js'

const adapter = new ZipPackAdapter()
const tempRoots: string[] = []
const previousConfigDir = process.env.CLAUDE_CONFIG_DIR

async function makeTempRoot(prefix: string) {
  const root = await mkdtemp(path.join(tmpdir(), prefix))
  tempRoots.push(root)
  return root
}

function customPackEntries(): Record<string, string> {
  return {
    'manifest.json': JSON.stringify({ packId: 'runtime-custom-pack', name: 'Runtime Pack', version: '1.0.0', schemaVersion: 1, type: 'expert-pack', entrypoints: { experts: ['experts/custom/expert.json'], skills: ['custom-guide'] } }),
    'experts/custom/expert.json': JSON.stringify({ id: 'custom-runtime-expert', name: 'Runtime Expert', description: 'ZIP-defined expert', promptPaths: { system: 'experts/custom/prompts/system.md' }, skillIds: ['custom-guide'] }),
    'experts/custom/prompts/system.md': '# Runtime Expert\nUse only the package content.\n',
    'skills/custom-guide/SKILL.md': '# Custom Guide\nFollow the package instructions.\n',
  }
}

function executablePackEntries(script: string): Record<string, string> {
  return {
    ...customPackEntries(),
    'manifest.json': JSON.stringify({ packId: 'runtime-executable-pack', name: 'Executable Pack', version: '1.0.0', schemaVersion: 1, type: 'expert-pack', entrypoints: { experts: ['experts/custom/expert.json'], skills: ['custom-guide'], tools: ['tools/local-tool/tool.json'] } }),
    'experts/custom/expert.json': JSON.stringify({ id: 'tool-runtime-expert', name: 'Tool Runtime Expert', description: 'ZIP-defined tool expert', skillIds: ['custom-guide'] }),
    'tools/local-tool/tool.json': JSON.stringify({ id: 'local-tool', name: 'Local tool', type: 'packageLocalExecutable', purpose: 'Test sandbox', command: 'tools/local-tool/index.js', permissions: [], network: 'none' }),
    'tools/local-tool/index.js': script,
  }
}

async function importPack(root: string, entries: Record<string, string>) {
  process.env.CLAUDE_CONFIG_DIR = root
  resetExpertPackRegistryForTests()
  await new ExpertPackRegistryService().importExpertPackZip(await adapter.write(entries))
}

describe('ExpertRuntimeService', () => {
  afterEach(async () => {
    process.env.CLAUDE_CONFIG_DIR = previousConfigDir
    resetExpertPackRegistryForTests()
    await Promise.all(tempRoots.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  it('loads prompts and skills only from the imported ZIP', async () => {
    const root = await makeTempRoot('expert-runtime-config-')
    await importPack(root, customPackEntries())

    const context = await new ExpertRuntimeService().loadContext('custom-runtime-expert')

    expect(context.globalSkillFallbackUsed).toBe(false)
    expect(context.prompts.system).toContain('package content')
    expect(context.skills[0]).toMatchObject({ skillId: 'custom-guide', source: 'expert-pack', packId: 'runtime-custom-pack' })
  })

  it('produces material from the selected ZIP context without expert-specific branches', async () => {
    const root = await makeTempRoot('expert-runtime-config-')
    const projectRoot = await makeTempRoot('expert-runtime-project-')
    await importPack(root, customPackEntries())

    const analysis = await new ExpertRuntimeService().analyze('custom-runtime-expert', { projectRoot, title: 'ZIP result', notes: 'User notes' })

    expect(analysis.material.runtime).toBe('expert-pack-runtime')
    expect(analysis.material.expertId).toBe('custom-runtime-expert')
    expect(analysis.material.packageLocalSkills[0]?.skillId).toBe('custom-guide')
    expect(analysis.material.input.notes).toBe('User notes')
    expect(analysis.summary).toContain('Runtime Expert')
  })

  it('does not execute package-local tools before confirmation', async () => {
    const root = await makeTempRoot('expert-runtime-config-')
    const projectRoot = await makeTempRoot('expert-runtime-project-')
    await importPack(root, executablePackEntries("await expert.writeText('should-not-exist.txt', 'bad')"))

    const analysis = await new ExpertRuntimeService().analyze('tool-runtime-expert', { projectRoot })

    expect(analysis.material.usedTools).toEqual([expect.objectContaining({ toolId: 'local-tool', executed: false, result: 'blocked-pending-permission-confirmation' })])
  })

  it('runs confirmed package-local tools only inside the output sandbox', async () => {
    const root = await makeTempRoot('expert-runtime-config-')
    const projectRoot = await makeTempRoot('expert-runtime-project-')
    const outputDir = path.join(projectRoot, '.workflow', 'intake', 'expert-runs', 'run-2', 'tool-runtime-expert')
    await importPack(root, executablePackEntries("await expert.writeText('tool-output.json', '{\"ok\":true}')"))

    const analysis = await new ExpertRuntimeService().analyze('tool-runtime-expert', { projectRoot, outputDir, confirmExecutableTools: true })
    const record = analysis.material.usedTools[0]

    expect(record).toEqual(expect.objectContaining({ toolId: 'local-tool', executed: true, exitStatus: 'completed' }))
    await expect(readFile(path.join(outputDir, 'tool-output.json'), 'utf8')).resolves.toContain('ok')
  })

  it('rejects unsafe package-local tools', async () => {
    const root = await makeTempRoot('expert-runtime-config-')
    const projectRoot = await makeTempRoot('expert-runtime-project-')
    const outputDir = path.join(projectRoot, '.workflow', 'intake', 'expert-runs', 'run-3', 'tool-runtime-expert')
    await importPack(root, executablePackEntries("await expert.writeText('../source-change.txt', 'bad')"))

    const analysis = await new ExpertRuntimeService().analyze('tool-runtime-expert', { projectRoot, outputDir, confirmExecutableTools: true })

    expect(analysis.material.usedTools[0]).toEqual(expect.objectContaining({ result: 'rejected-by-sandbox', exitStatus: 'rejected' }))
  })
})
