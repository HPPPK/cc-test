import { createHash } from 'node:crypto'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { getWorkflowPackStorageDir } from './packRegistryService.js'
import type { WorkflowPhaseSkillCatalogEntry } from './workflowPhaseSkillResolver.js'
import { safePackFileSegment } from './workflowPackSkillService.js'
import { ZipPackAdapter, assertSafeZipPath } from './zipPackAdapter.js'

export const BUNDLED_BRAINSTORMING_REFERENCE_ID = 'superpowers:brainstorming'

export type WorkflowBrainstormingContract = {
  content: string
  identity: string
  source: 'workflow-pack' | 'bundled'
  sourcePath: string
}

const zipAdapter = new ZipPackAdapter()

export async function loadWorkflowBrainstormingContract(
  catalog: WorkflowPhaseSkillCatalogEntry[],
  selectedPackId: string | undefined,
  storedWorkflowId?: string,
): Promise<WorkflowBrainstormingContract | null> {
  const workflowPackSkill = selectedPackId
    ? catalog.find((entry) => (
        entry.source === 'managed'
        && entry.packId === selectedPackId
        && skillMatchesReference(entry, BUNDLED_BRAINSTORMING_REFERENCE_ID)
      ))
    : undefined
  const workflowPackContent = workflowPackSkill
    ? await readCatalogSkillContent(workflowPackSkill, storedWorkflowId)
    : null
  if (workflowPackSkill?.sourcePath && workflowPackContent) {
    return contract(workflowPackContent, 'workflow-pack', workflowPackSkill.sourcePath, workflowPackSkill.contentHash)
  }

  const bundledSkill = catalog.find((entry) => (
    entry.source === 'bundled' && skillMatchesReference(entry, BUNDLED_BRAINSTORMING_REFERENCE_ID)
  ))
  const bundledContent = bundledSkill ? await readCatalogSkillContent(bundledSkill) : null
  if (!bundledSkill?.sourcePath || !bundledContent) return null
  return contract(bundledContent, 'bundled', bundledSkill.sourcePath, bundledSkill.contentHash)
}

export async function loadBundledBrainstormingFallback(
  catalog: WorkflowPhaseSkillCatalogEntry[],
): Promise<string | null> {
  const loaded = await loadWorkflowBrainstormingContract(catalog, undefined)
  return loaded?.source === 'bundled' ? loaded.content : null
}

async function readCatalogSkillContent(
  entry: WorkflowPhaseSkillCatalogEntry,
  storedWorkflowId?: string,
): Promise<string | null> {
  const sourcePath = entry.sourcePath
  if (!sourcePath) return null
  if (!sourcePath.startsWith('pack://')) {
    const content = await fs.readFile(sourcePath, 'utf-8').catch(() => '')
    return content.trim() || null
  }

  const parsed = parsePackSourcePath(sourcePath)
  if (!parsed || parsed.packId !== entry.packId) return null
  assertSafeZipPath(parsed.entryPath)
  const candidateIds = Array.from(new Set([storedWorkflowId, parsed.packId].filter((value): value is string => Boolean(value))))
  for (const candidateId of candidateIds) {
    const zipPath = path.join(getWorkflowPackStorageDir(), safePackFileSegment(candidateId) + '.zip')
    const zipBytes = await fs.readFile(zipPath).catch(() => null)
    if (!zipBytes) continue
    const zip = await zipAdapter.read(new Uint8Array(zipBytes)).catch(() => null)
    if (!zip?.has(parsed.entryPath)) continue
    const content = await zip.readText(parsed.entryPath).catch(() => '')
    if (content.trim()) return content.trim()
  }
  return null
}

function parsePackSourcePath(sourcePath: string): { packId: string; entryPath: string } | null {
  const value = sourcePath.slice('pack://'.length)
  const separator = value.indexOf('/')
  if (separator <= 0 || separator === value.length - 1) return null
  return {
    packId: value.slice(0, separator),
    entryPath: value.slice(separator + 1),
  }
}

function contract(
  content: string,
  source: WorkflowBrainstormingContract['source'],
  sourcePath: string,
  declaredHash?: string,
): WorkflowBrainstormingContract {
  const contentHash = declaredHash?.replace(/^sha256-/, '')
    ?? createHash('sha256').update(content).digest('hex')
  return {
    content,
    source,
    sourcePath,
    identity: source + ':sha256-' + contentHash,
  }
}

function skillMatchesReference(
  entry: WorkflowPhaseSkillCatalogEntry,
  referenceId: string,
): boolean {
  return entry.name === referenceId ||
    entry.referenceId === referenceId ||
    entry.aliases?.includes(referenceId) === true ||
    entry.packSkillIdentity === referenceId ||
    (referenceId === BUNDLED_BRAINSTORMING_REFERENCE_ID && entry.name === 'brainstorming')
}
