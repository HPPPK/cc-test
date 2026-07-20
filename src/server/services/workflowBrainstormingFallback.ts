import * as fs from 'node:fs/promises'
import type { WorkflowPhaseSkillCatalogEntry } from './workflowPhaseSkillResolver.js'

export const BUNDLED_BRAINSTORMING_REFERENCE_ID = 'superpowers:brainstorming'

export async function loadBundledBrainstormingFallback(
  catalog: WorkflowPhaseSkillCatalogEntry[],
): Promise<string | null> {
  const bundledSkill = catalog.find((entry) => (
    entry.source === 'bundled' && skillMatchesReference(entry, BUNDLED_BRAINSTORMING_REFERENCE_ID)
  ))
  if (!bundledSkill?.sourcePath) return null

  const content = await fs.readFile(bundledSkill.sourcePath, 'utf-8').catch(() => '')
  return content.trim() || null
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
