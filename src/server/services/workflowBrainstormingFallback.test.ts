import { afterEach, describe, expect, test } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  BUNDLED_BRAINSTORMING_REFERENCE_ID,
  loadBundledBrainstormingFallback,
} from './workflowBrainstormingFallback.js'
import type { WorkflowPhaseSkillCatalogEntry } from './workflowPhaseSkillResolver.js'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })))
})

async function writeSkill(content: string): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workflow-brainstorming-fallback-'))
  tempDirs.push(directory)
  const skillPath = path.join(directory, 'SKILL.md')
  await fs.writeFile(skillPath, content, 'utf-8')
  return skillPath
}

function catalogEntry(sourcePath: string, source: WorkflowPhaseSkillCatalogEntry['source'] = 'bundled'): WorkflowPhaseSkillCatalogEntry {
  return {
    name: BUNDLED_BRAINSTORMING_REFERENCE_ID,
    displayName: 'Brainstorming',
    source,
    referenceId: BUNDLED_BRAINSTORMING_REFERENCE_ID,
    sourcePath,
  }
}

describe('workflow brainstorming fallback', () => {
  test('loads the complete bundled SKILL.md only from the bundled catalog entry', async () => {
    const bundledSkill = await writeSkill('# Brainstorming Ideas Into Designs\n\n<HARD-GATE>\nWait for approval.\n</HARD-GATE>')
    const userSkill = await writeSkill('# User override')

    const fallback = await loadBundledBrainstormingFallback([
      catalogEntry(userSkill, 'user'),
      catalogEntry(bundledSkill),
    ])

    expect(fallback).toContain('# Brainstorming Ideas Into Designs')
    expect(fallback).toContain('<HARD-GATE>')
    expect(fallback).not.toContain('# User override')
  })

  test('recognizes the bundled brainstorming directory when the copied complete SKILL.md has no referenceId frontmatter', async () => {
    const bundledSkill = await writeSkill('# Brainstorming Ideas Into Designs\n\n<HARD-GATE>\nWait for approval.\n</HARD-GATE>')

    const fallback = await loadBundledBrainstormingFallback([
      {
        ...catalogEntry(bundledSkill),
        name: 'brainstorming',
        referenceId: undefined,
      },
    ])

    expect(fallback).toContain('# Brainstorming Ideas Into Designs')
    expect(fallback).toContain('<HARD-GATE>')
  })

  test('returns null when the bundled fallback is not available', async () => {
    const localSkill = await writeSkill('# Local brainstorming')

    await expect(loadBundledBrainstormingFallback([
      catalogEntry(localSkill, 'superpowers'),
    ])).resolves.toBeNull()
  })
})
