import { afterEach, describe, expect, it } from 'bun:test'
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { buildWorkflowPacks } from './build-workflow-packs.js'
import {
  WorkflowPackAuditError,
  auditWorkflowPackResources,
} from './audit-workflow-packs.js'
import { auditWindowsWorkflowBundle } from './audit-windows-workflow-bundle.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'workflow-pack-audit-'))
  roots.push(root)
  const sourceDir = path.join(root, 'workflows')
  const outputDir = path.join(root, 'repository-packs')
  const lockFile = path.join(root, 'workflow-pack-lock.json')
  const packRoot = path.join(sourceDir, 'sample-workflow')
  await mkdir(path.join(packRoot, 'workflows'), { recursive: true })
  await writeFile(path.join(packRoot, 'manifest.json'), JSON.stringify({
    packId: 'sample-workflow',
    name: 'Sample',
    version: '7',
    schemaVersion: 2,
    type: 'workflow-pack',
    entrypoints: {
      workflows: ['workflows/sample-workflow.workflow.json'],
      experts: [],
      skills: [],
    },
  }))
  await writeFile(path.join(packRoot, 'workflows', 'sample-workflow.workflow.json'), JSON.stringify({
    id: 'sample-workflow',
    name: 'Sample',
    version: '7',
    source: 'pack',
    phases: [{ id: 'plan', name: 'Plan' }],
  }))
  const built = await buildWorkflowPacks({
    sourceDir,
    outputDir,
    lockFile,
    packIds: ['sample-workflow'],
    sourceRevision: 'fixture-revision',
  })
  const resourceDir = path.join(root, 'release', 'resources')
  const packDir = path.join(resourceDir, 'binaries', 'packs')
  await mkdir(packDir, { recursive: true })
  await cp(built.packs[0]!.outputPath, path.join(packDir, built.packs[0]!.filename))
  return {
    root,
    lockFile,
    resourceDir,
    packDir,
    pack: built.packs[0]!,
    outputFile: path.join(root, 'artifacts', 'workflow-pack-audit.json'),
  }
}

describe('workflow pack release resource audit', () => {
  it('finds a nested pack resource layer and writes a machine-readable pass report', async () => {
    const fx = await fixture()
    const report = await auditWorkflowPackResources({
      resourceDir: fx.resourceDir,
      lockFile: fx.lockFile,
      layer: 'windows-release-resource',
      outputFile: fx.outputFile,
    })

    expect(report.result).toBe('pass')
    expect(report.layer).toBe('windows-release-resource')
    expect(report.packDir).toBe(fx.packDir)
    expect(report.packs).toEqual([expect.objectContaining({
      packId: 'sample-workflow',
      version: '7',
      workflowVersion: '7',
      expectedSha256: fx.pack.sha256,
      actualSha256: fx.pack.sha256,
      layer: 'windows-release-resource',
      result: 'pass',
    })])

    const written = JSON.parse(await readFile(fx.outputFile, 'utf8'))
    expect(written).toEqual(report)
  })

  it('writes a failure report before rejecting a mismatched release resource', async () => {
    const fx = await fixture()
    await writeFile(path.join(fx.packDir, fx.pack.filename), 'corrupt')

    let caught: unknown
    try {
      await auditWorkflowPackResources({
        resourceDir: fx.resourceDir,
        lockFile: fx.lockFile,
        layer: 'windows-release-resource',
        outputFile: fx.outputFile,
      })
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(WorkflowPackAuditError)
    const written = JSON.parse(await readFile(fx.outputFile, 'utf8'))
    expect(written.result).toBe('fail')
    expect(written.packs[0]).toEqual(expect.objectContaining({
      packId: 'sample-workflow',
      version: '7',
      layer: 'windows-release-resource',
      result: 'checksum-mismatch',
    }))
    expect(written.packs[0].actualSha256).not.toBe(fx.pack.sha256)
  })
})


describe('Windows workflow bundle audit', () => {
  it('extracts the built installer before auditing workflow pack bytes', async () => {
    const fx = await fixture()
    const installerPath = path.join(fx.root, 'Claude-Code-Jiangxia.exe')
    await writeFile(installerPath, 'fixture installer')
    const extractedRoots: string[] = []

    const report = await auditWindowsWorkflowBundle({
      installerPath,
      lockFile: fx.lockFile,
      layer: 'windows-release-bundle',
      outputFile: fx.outputFile,
      extractor: async (_installerPath, extractDir) => {
        extractedRoots.push(extractDir)
        await cp(fx.resourceDir, extractDir, { recursive: true })
      },
    })

    expect(report.result).toBe('pass')
    expect(report.layer).toBe('windows-release-bundle')
    expect(report.packs[0]).toEqual(expect.objectContaining({
      packId: 'sample-workflow',
      actualSha256: fx.pack.sha256,
      result: 'pass',
    }))
    expect(extractedRoots).toHaveLength(1)
  })

  it('writes the failed post-build report when installer resources differ from the lock', async () => {
    const fx = await fixture()
    const installerPath = path.join(fx.root, 'Claude-Code-Jiangxia.msi')
    await writeFile(installerPath, 'fixture installer')

    let caught: unknown
    try {
      await auditWindowsWorkflowBundle({
        installerPath,
        lockFile: fx.lockFile,
        layer: 'windows-release-bundle',
        outputFile: fx.outputFile,
        extractor: async (_installerPath, extractDir) => {
          await cp(fx.resourceDir, extractDir, { recursive: true })
          const extractedPack = path.join(extractDir, 'binaries', 'packs', fx.pack.filename)
          await writeFile(extractedPack, 'corrupt packaged bytes')
        },
      })
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(WorkflowPackAuditError)
    const written = JSON.parse(await readFile(fx.outputFile, 'utf8'))
    expect(written.result).toBe('fail')
    expect(written.layer).toBe('windows-release-bundle')
    expect(written.packs[0].result).toBe('checksum-mismatch')
  })
})
