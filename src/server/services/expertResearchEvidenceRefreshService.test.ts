import { afterEach, expect, test } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { refreshRegisteredResearchEvidence } from './expertResearchEvidenceRefreshService.js'
import type { ExpertResearchArtifactPolicy } from './expertResearchArtifactPolicyService.js'
import type { ExpertResearchEvidenceState } from './expertResearchEvidenceReviewService.js'

// Creating file symlinks requires additional privileges on Windows.
const symlinkTest = process.platform === 'win32' ? test.skip : test
const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true }))) })
const policy: ExpertResearchArtifactPolicy = {
  mode: 'markdown-path-only', directory: 'research', briefPath: 'research/01.md',
  researcherPaths: ['research/02.md'], researcherParts: true,
  reviewerPath: 'research/05.md', auditPath: 'research/06.md', maxCharacters: 90_000,
}
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'evidence-refresh-'))
  roots.push(root)
  const artifactPath = 'research/02.parts/worker.md'
  const file = path.join(root, artifactPath)
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, 'corrected prose')
  const evidence: ExpertResearchEvidenceState = {
    updatedAt: 'old-state', records: [{ agentId: 'worker', agentType: 'researcher', recordedAt: 'original-receipt',
      artifactPath, content: 'old prose', entries: [{ target: 'https://example.com/product', kind: 'url', status: 'opened' }] }],
  }
  return { root, file, evidence }
}
const refresh = (root: string, evidence: ExpertResearchEvidenceState) => refreshRegisteredResearchEvidence(root, policy, evidence, ['researcher'])

test('refreshes only registered prose and preserves receipts, audits, unknown fields and input state', async () => {
  const { root, evidence } = await fixture()
  const future = { ...evidence, futureState: true, records: [{ ...evidence.records[0], futureRecord: true }] }
  const result = await refresh(root, future)
  expect(result.records[0]).toEqual({ ...future.records[0], content: 'corrected prose' })
  expect(result.records[0].entries).toBe(evidence.records[0].entries)
  expect(result.records[0].recordedAt).toBe('original-receipt')
  expect(result).toMatchObject({ futureState: true })
  expect(evidence.records[0].content).toBe('old prose')
})

test('identical bytes and timestamp-only rewrites preserve state identity', async () => {
  const { root, file, evidence } = await fixture()
  await fs.writeFile(file, evidence.records[0].content)
  expect(await refresh(root, evidence)).toBe(evidence)
  await fs.utimes(file, new Date(), new Date())
  expect(await refresh(root, evidence)).toBe(evidence)
})

test('legacy records without paths and non-source workers remain unchanged', async () => {
  const { root, evidence } = await fixture()
  delete evidence.records[0].artifactPath
  expect(await refresh(root, evidence)).toBe(evidence)
  evidence.records[0].artifactPath = '../private.md'
  evidence.records[0].agentType = 'reviewer'
  expect(await refresh(root, evidence)).toBe(evidence)
})

test('missing files and missing workspaces retain existing handoff recovery without creating files', async () => {
  const { root, file, evidence } = await fixture()
  await fs.unlink(file)
  expect(await refresh(root, evidence)).toBe(evidence)
  expect(await fs.exists(file)).toBe(false)
  expect(await refresh(path.join(root, 'absent'), evidence)).toBe(evidence)
})

test.each(['../outside.md', 'research/05.md'])('rejects undeclared or escaping registered paths: %s', async artifactPath => {
  const { root, evidence } = await fixture()
  evidence.records[0].artifactPath = artifactPath
  await expect(refresh(root, evidence)).rejects.toMatchObject({ code: 'EXPERT_RESEARCH_EVIDENCE_CONTRACT_INVALID' })
})

symlinkTest.each(['file', 'parent'])('rejects %s symlinks even into the same workspace', async kind => {
  const { root, file, evidence } = await fixture()
  const target = path.join(root, 'sibling')
  await fs.mkdir(target)
  await fs.writeFile(path.join(target, 'worker.md'), 'unregistered content')
  if (kind === 'file') {
    await fs.unlink(file)
    await fs.symlink(path.join(target, 'worker.md'), file)
  } else {
    await fs.rm(path.dirname(file), { recursive: true })
    await fs.symlink(target, path.dirname(file))
  }
  await expect(refresh(root, evidence)).rejects.toMatchObject({ statusCode: 409 })
})

test('rejects a directory at the registered file path', async () => {
  const { root, file, evidence } = await fixture()
  await fs.unlink(file)
  await fs.mkdir(file)
  await expect(refresh(root, evidence)).rejects.toMatchObject({ statusCode: 409 })
})

symlinkTest('supports a workspace alias without following symlinks inside that workspace', async () => {
  const { root, evidence } = await fixture()
  const alias = path.join(root, 'alias')
  await fs.symlink(root, alias)
  expect((await refresh(alias, evidence)).records[0].content).toBe('corrected prose')
})

test('mixed records refresh sources without touching legacy or reviewer content', async () => {
  const { root, evidence } = await fixture()
  const legacy = { ...evidence.records[0], agentId: 'legacy', artifactPath: undefined }
  const reviewer = { ...evidence.records[0], agentId: 'reviewer', agentType: 'reviewer', artifactPath: '../private.md' }
  evidence.records.push(legacy, reviewer)
  const result = await refresh(root, evidence)
  expect(result.records[0].content).toBe('corrected prose')
  expect(result.records[1]).toBe(legacy)
  expect(result.records[2]).toBe(reviewer)
})

symlinkTest('a workspace resolution error is reported instead of validating stale content', async () => {
  const { root, evidence } = await fixture()
  const loop = path.join(root, 'loop')
  await fs.symlink(loop, loop)
  await expect(refresh(loop, evidence)).rejects.toMatchObject({ code: 'EXPERT_RESEARCH_EVIDENCE_CONTRACT_INVALID' })
})
