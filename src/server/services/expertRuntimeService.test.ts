import { afterEach, describe, expect, it } from 'bun:test'
import { link, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
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

// Windows file symlinks require Developer Mode or an elevated token. Skip
// only these fixtures when that concrete capability is unavailable.
const symlinksUnavailable = await (async () => {
  if (process.platform !== 'win32') return false
  const root = await mkdtemp(path.join(tmpdir(), 'expert-runtime-symlink-probe-'))
  try {
    await writeFile(path.join(root, 'target'), 'probe')
    await symlink(path.join(root, 'target'), path.join(root, 'link'), 'file')
    return false
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOSYS'].includes((error as NodeJS.ErrnoException).code ?? '')) return true
    throw error
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})()

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

  // These fixtures deliberately retain tmpdir()'s native spelling: macOS /var
  // aliases must work as roots even though realpath() returns /private/var.
  for (const operation of ['read-file', 'read-directory', 'list-directory', 'write-file', 'write-directory', 'write-dangling-file'] as const) {
    it.skipIf(symlinksUnavailable)(`rejects ${operation} through an outside symlink`, async () => {
      const root = await makeTempRoot('expert-runtime-config-')
      const projectRoot = await makeTempRoot('expert-runtime-project-')
      const outside = await makeTempRoot('expert-runtime-outside-')
      const outputDir = path.join(projectRoot, 'output')
      await mkdir(outputDir)
      await writeFile(path.join(outside, 'secret.txt'), 'outside secret')
      const isWrite = operation.startsWith('write')
      const directoryLink = operation.endsWith('directory')
      const linkedName = directoryLink ? 'linked-dir' : 'linked.txt'
      const targetName = operation === 'write-dangling-file' ? 'new.txt' : 'secret.txt'
      await symlink(directoryLink ? outside : path.join(outside, targetName), path.join(isWrite ? outputDir : projectRoot, linkedName), directoryLink ? 'junction' : 'file')
      const script = operation === 'list-directory'
        ? "return await expert.listDir('linked-dir')"
        : isWrite
          ? `await expert.writeText('${directoryLink ? 'linked-dir/nested/new.txt' : 'linked.txt'}', 'escaped')`
          : `return await expert.readText('${directoryLink ? 'linked-dir/secret.txt' : 'linked.txt'}')`
      await importPack(root, executablePackEntries(script))

      const analysis = await new ExpertRuntimeService().analyze('tool-runtime-expert', { projectRoot, outputDir, confirmExecutableTools: true })

      expect(analysis.material.usedTools[0]).toEqual(expect.objectContaining({ result: 'rejected-by-sandbox', exitStatus: 'rejected' }))
      expect(analysis.material.usedTools[0]).not.toHaveProperty('returnValue')
      expect(analysis.material.usedTools[0]?.inputSummary).toEqual([])
      expect(analysis.material.usedTools[0]?.outputPaths).toEqual([])
      expect(await readFile(path.join(outside, 'secret.txt'), 'utf8')).toBe('outside secret')
      await expect(readFile(path.join(outside, 'nested/new.txt'), 'utf8')).rejects.toThrow()
      await expect(readFile(path.join(outside, 'new.txt'), 'utf8')).rejects.toThrow()
    })
  }

  it.skipIf(symlinksUnavailable)('rejects the default output directory when its project ancestor links outside', async () => {
    const root = await makeTempRoot('expert-runtime-config-')
    const projectRoot = await makeTempRoot('expert-runtime-project-')
    const outside = await makeTempRoot('expert-runtime-outside-')
    await symlink(outside, path.join(projectRoot, '.workflow'), 'junction')
    await importPack(root, executablePackEntries("await expert.writeText('escaped.txt', 'bad')"))

    const analysis = await new ExpertRuntimeService().analyze('tool-runtime-expert', { projectRoot, confirmExecutableTools: true })

    expect(analysis.material.usedTools[0]).toEqual(expect.objectContaining({ result: 'rejected-by-sandbox', exitStatus: 'rejected' }))
    await expect(readFile(path.join(outside, 'intake/expert-runs/runtime/tool-runtime-expert/escaped.txt'), 'utf8')).rejects.toThrow()
    await expect(realpath(path.join(outside, 'intake'))).rejects.toThrow()
  })

  it('reads and lists the selected project and creates nested output using native temporary roots', async () => {
    const root = await makeTempRoot('expert-runtime-config-')
    const projectRoot = await makeTempRoot('expert-runtime-project-')
    const outputDir = path.join(projectRoot, 'new-output', 'run')
    await writeFile(path.join(projectRoot, 'source.txt'), 'project source')
    await importPack(root, executablePackEntries("const entries = await expert.listDir(); const text = await expert.readText('source.txt'); await expert.writeText('nested/result.txt', text); return entries.some(entry => entry.name === 'source.txt')"))

    const analysis = await new ExpertRuntimeService().analyze('tool-runtime-expert', { projectRoot, outputDir, confirmExecutableTools: true })

    expect(analysis.material.usedTools[0]).toEqual(expect.objectContaining({ exitStatus: 'completed', returnValue: true }))
    expect(await readFile(path.join(outputDir, 'nested/result.txt'), 'utf8')).toBe('project source')
  })

  it.skipIf(symlinksUnavailable)('canonicalizes caller-selected symlink roots before enforcing child boundaries', async () => {
    const root = await makeTempRoot('expert-runtime-config-')
    const fixture = await makeTempRoot('expert-runtime-links-')
    const project = await makeTempRoot('expert-runtime-project-')
    const output = await makeTempRoot('expert-runtime-output-')
    const projectRoot = path.join(fixture, 'project')
    const outputDir = path.join(fixture, 'output')
    await symlink(project, projectRoot, 'junction')
    await symlink(output, outputDir, 'junction')
    await writeFile(path.join(project, 'source.txt'), 'selected source')
    await importPack(root, executablePackEntries("await expert.writeText('result.txt', await expert.readText('source.txt')); return { projectRoot: expert.projectRoot, outputRoot: expert.outputRoot }"))

    const analysis = await new ExpertRuntimeService().analyze('tool-runtime-expert', { projectRoot, outputDir, confirmExecutableTools: true })

    expect(analysis.material.usedTools[0]).toEqual(expect.objectContaining({ exitStatus: 'completed', returnValue: { projectRoot: await realpath(project), outputRoot: await realpath(output) } }))
    expect(await readFile(path.join(output, 'result.txt'), 'utf8')).toBe('selected source')
  })

  it('rejects writing a hard-linked output file without changing its outside inode', async () => {
    const root = await makeTempRoot('expert-runtime-config-')
    const projectRoot = await makeTempRoot('expert-runtime-project-')
    const outputDir = await makeTempRoot('expert-runtime-output-')
    const outside = await makeTempRoot('expert-runtime-outside-')
    await writeFile(path.join(outside, 'secret.txt'), 'outside secret')
    await link(path.join(outside, 'secret.txt'), path.join(outputDir, 'linked.txt'))
    await importPack(root, executablePackEntries("await expert.writeText('linked.txt', 'escaped')"))

    const analysis = await new ExpertRuntimeService().analyze('tool-runtime-expert', { projectRoot, outputDir, confirmExecutableTools: true })

    expect(analysis.material.usedTools[0]).toEqual(expect.objectContaining({ exitStatus: 'rejected', result: 'rejected-by-sandbox' }))
    expect(await readFile(path.join(outside, 'secret.txt'), 'utf8')).toBe('outside secret')
  })

  it.skipIf(symlinksUnavailable)('rejects a project-relative explicit output root that links outside', async () => {
    const root = await makeTempRoot('expert-runtime-config-')
    const projectRoot = await makeTempRoot('expert-runtime-project-')
    const outside = await makeTempRoot('expert-runtime-outside-')
    await symlink(outside, path.join(projectRoot, '.workflow'), 'junction')
    await importPack(root, executablePackEntries("await expert.writeText('escaped.txt', 'bad')"))

    const analysis = await new ExpertRuntimeService().analyze('tool-runtime-expert', { projectRoot, outputDir: path.join(projectRoot, '.workflow/derived'), confirmExecutableTools: true })

    expect(analysis.material.usedTools[0]).toEqual(expect.objectContaining({ exitStatus: 'rejected', result: 'rejected-by-sandbox' }))
    await expect(realpath(path.join(outside, 'derived'))).rejects.toThrow()
  })

  for (const runId of ['..', '.', '../collision', '../../../../escaped', '/absolute', 'nested\\run', 'C:run', 'bad\0run']) {
    it(`rejects a non-component default runId ${JSON.stringify(runId)} before directory creation`, async () => {
      const root = await makeTempRoot('expert-runtime-config-')
      const fixture = await makeTempRoot('expert-runtime-derived-')
      const projectRoot = path.join(fixture, 'project')
      await mkdir(projectRoot)
      await importPack(root, executablePackEntries("await expert.writeText('escaped.txt', 'bad')"))

      const analysis = await new ExpertRuntimeService().analyze('tool-runtime-expert', { projectRoot, runId, confirmExecutableTools: true })

      expect(analysis.material.usedTools[0]).toEqual(expect.objectContaining({ exitStatus: 'rejected', result: 'rejected-by-sandbox' }))
      expect(await readdir(projectRoot)).toEqual([])
      expect(await readdir(fixture)).toEqual(['project'])
    })
  }

  it('rejects an imported expert ID that escapes its default run directory before creating output', async () => {
    const root = await makeTempRoot('expert-runtime-config-')
    const projectRoot = await makeTempRoot('expert-runtime-project-')
    const entries = executablePackEntries("await expert.writeText('escaped.txt', 'bad')")
    entries['experts/custom/expert.json'] = JSON.stringify({ id: '../..', name: 'Escaping Expert', description: 'Unsafe derived path', skillIds: ['custom-guide'] })
    await importPack(root, entries)

    const analysis = await new ExpertRuntimeService().analyze('../..', { projectRoot, confirmExecutableTools: true })

    expect(analysis.material.usedTools[0]).toEqual(expect.objectContaining({ exitStatus: 'rejected', result: 'rejected-by-sandbox' }))
    expect(await readdir(projectRoot)).toEqual([])
  })

  it('overwrites an ordinary output file without retaining old trailing bytes', async () => {
    const root = await makeTempRoot('expert-runtime-config-')
    const projectRoot = await makeTempRoot('expert-runtime-project-')
    const outputDir = await makeTempRoot('expert-runtime-output-')
    await writeFile(path.join(outputDir, 'existing.txt'), 'old longer output')
    await importPack(root, executablePackEntries("await expert.writeText('existing.txt', 'new')"))

    const analysis = await new ExpertRuntimeService().analyze('tool-runtime-expert', { projectRoot, outputDir, confirmExecutableTools: true })

    expect(analysis.material.usedTools[0]).toEqual(expect.objectContaining({ exitStatus: 'completed' }))
    expect(await readFile(path.join(outputDir, 'existing.txt'), 'utf8')).toBe('new')
  })

  it('uses the canonical spelling of an existing selected output directory', async () => {
    const root = await makeTempRoot('expert-runtime-config-')
    const projectRoot = await makeTempRoot('expert-runtime-project-')
    const actualOutput = path.join(projectRoot, 'ReportOutput')
    await mkdir(actualOutput)
    const caseAlias = path.join(projectRoot, 'reportoutput')
    // On case-insensitive volumes exercise the alias; other volumes exercise
    // the same existing-directory contract with its exact spelling.
    const outputDir = await realpath(caseAlias).then(() => caseAlias, () => actualOutput)
    await importPack(root, executablePackEntries("await expert.writeText('result.txt', 'ok'); return expert.outputRoot"))

    const analysis = await new ExpertRuntimeService().analyze('tool-runtime-expert', { projectRoot, outputDir, confirmExecutableTools: true })

    expect(analysis.material.usedTools[0]).toEqual(expect.objectContaining({ exitStatus: 'completed', returnValue: await realpath(actualOutput) }))
    expect(await readFile(path.join(actualOutput, 'result.txt'), 'utf8')).toBe('ok')
  })

  it('rejects unsafe package-local tools', async () => {
    const root = await makeTempRoot('expert-runtime-config-')
    const projectRoot = await makeTempRoot('expert-runtime-project-')
    const outputDir = path.join(projectRoot, '.workflow', 'intake', 'expert-runs', 'run-3', 'tool-runtime-expert')
    await importPack(root, executablePackEntries("await expert.writeText('../source-change.txt', 'bad')"))

    const analysis = await new ExpertRuntimeService().analyze('tool-runtime-expert', { projectRoot, outputDir, confirmExecutableTools: true })

    expect(analysis.material.usedTools[0]).toEqual(expect.objectContaining({ result: 'rejected-by-sandbox', exitStatus: 'rejected' }))
  })
  it('loads a declared output template from the selected expert ZIP', async () => {
    const root = await makeTempRoot('expert-runtime-config-')
    const entries = customPackEntries()
    entries['experts/custom/expert.json'] = JSON.stringify({
      id: 'custom-runtime-expert',
      name: 'Runtime Expert',
      description: 'ZIP-defined expert',
      promptPaths: { system: 'experts/custom/prompts/system.md' },
      outputTemplatePath: 'experts/custom/templates/report.html',
      skillIds: ['custom-guide'],
    })
    entries['experts/custom/templates/report.html'] = '<html><body>{{REPORT_TITLE}}</body></html>'
    await importPack(root, entries)

    const context = await new ExpertRuntimeService().loadContext('custom-runtime-expert')
    expect(context.outputTemplate).toEqual({
      path: 'experts/custom/templates/report.html',
      content: '<html><body>{{REPORT_TITLE}}</body></html>',
    })
  })

})
