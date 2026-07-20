import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  WorkflowPackExportDependencyError,
  buildSelfContainedWorkflowPackDependencies,
  buildWorkflowPackSkillInstallPlan,
} from './workflowPackSkillService.js'
import { ZipPackAdapter } from './zipPackAdapter.js'

let tempRoot: string
let originalConfigDir: string | undefined
let originalSkillsDir: string | undefined
let originalBundledSkillsDir: string | undefined

const encoder = new TextEncoder()

function jsonBytes(value: unknown): Uint8Array {
  return encoder.encode(JSON.stringify(value, null, 2))
}

async function writeSkill(root: string, name: string, options: { referenceId?: string; body?: string } = {}): Promise<string> {
  const skillDir = path.join(root, name)
  await fs.mkdir(skillDir, { recursive: true })
  await fs.writeFile(path.join(skillDir, 'SKILL.md'), `---\nname: "${name}"\nreferenceId: "${options.referenceId ?? name}"\n---\n# ${name}\n\n${options.body ?? 'Use this focused test skill.'}\n`, 'utf-8')
  await fs.writeFile(path.join(skillDir, 'guide.md'), `# ${name} guide\n`, 'utf-8')
  return skillDir
}

function workflowWithPhase(phase: Record<string, unknown>) {
  return {
    id: 'pack-skill-flow',
    schemaVersion: 2,
    version: '1.0.0',
    name: 'Pack Skill Flow',
    description: 'Workflow used by pack-skill service tests.',
    phases: [{
      id: 'implement',
      name: 'Implement',
      instructions: 'Implement with the referenced skills.',
      skills: [],
      skillBindings: [],
      ...phase,
    }],
  }
}

async function makeZipArchive(entries: Record<string, Uint8Array | string>) {
  return new ZipPackAdapter().read(await new ZipPackAdapter().write(entries))
}

beforeEach(async () => {
  originalConfigDir = process.env.CLAUDE_CONFIG_DIR
  originalSkillsDir = process.env.CLAUDE_SKILLS_DIR
  originalBundledSkillsDir = process.env.CLAUDE_BUNDLED_SKILLS_DIR
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-workflow-pack-skills-'))
  process.env.CLAUDE_CONFIG_DIR = path.join(tempRoot, 'config')
  process.env.CLAUDE_SKILLS_DIR = path.join(tempRoot, 'skills')
  process.env.CLAUDE_BUNDLED_SKILLS_DIR = path.join(tempRoot, 'bundled-skills')
  await fs.mkdir(process.env.CLAUDE_CONFIG_DIR, { recursive: true })
  await fs.mkdir(process.env.CLAUDE_SKILLS_DIR, { recursive: true })
  await fs.mkdir(process.env.CLAUDE_BUNDLED_SKILLS_DIR, { recursive: true })
})

afterEach(async () => {
  if (originalConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR
  else process.env.CLAUDE_CONFIG_DIR = originalConfigDir
  if (originalSkillsDir === undefined) delete process.env.CLAUDE_SKILLS_DIR
  else process.env.CLAUDE_SKILLS_DIR = originalSkillsDir
  if (originalBundledSkillsDir === undefined) delete process.env.CLAUDE_BUNDLED_SKILLS_DIR
  else process.env.CLAUDE_BUNDLED_SKILLS_DIR = originalBundledSkillsDir
  await fs.rm(tempRoot, { recursive: true, force: true })
})

describe('workflow pack skill dependencies', () => {
  test('builds a self-contained v2 export with real SKILL.md entries and original workflow reference mappings', async () => {
    await writeSkill(process.env.CLAUDE_SKILLS_DIR!, 'sp-pack-skill-fixture')

    const dependencies = await buildSelfContainedWorkflowPackDependencies([
      workflowWithPhase({
        skills: [{
          name: 'spec-kit-plus:pack-skill-fixture',
          namespace: 'spec-kit-plus',
          referenceId: 'spec-kit-plus:pack-skill-fixture',
        }],
        skillBindings: ['spec-kit-plus:pack-skill-fixture'],
        toolPolicy: { allowedTools: ['Read', 'Bash'] },
      }),
    ])

    expect(dependencies.entrypoints).toEqual(['skills/spec-kit-plus-pack-skill-fixture/SKILL.md'])
    expect(Object.keys(dependencies.entries).sort()).toEqual([
      'skills/spec-kit-plus-pack-skill-fixture/SKILL.md',
      'skills/spec-kit-plus-pack-skill-fixture/guide.md',
    ])
    expect(dependencies.skills).toHaveLength(1)
    expect(dependencies.skills[0]).toMatchObject({
      identity: 'spec-kit-plus:pack-skill-fixture',
      safeName: 'spec-kit-plus-pack-skill-fixture',
      entrypoint: 'skills/spec-kit-plus-pack-skill-fixture/SKILL.md',
      references: ['spec-kit-plus:pack-skill-fixture'],
    })
    expect(dependencies.skills[0]?.aliases).toEqual(expect.arrayContaining([
      'spec-kit-plus:pack-skill-fixture',
      'sp-pack-skill-fixture',
    ]))
    expect(dependencies.skills[0]?.referenceMappings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        workflowId: 'pack-skill-flow',
        phaseId: 'implement',
        field: 'skills',
        reference: 'spec-kit-plus:pack-skill-fixture',
        name: 'spec-kit-plus:pack-skill-fixture',
        namespace: 'spec-kit-plus',
        referenceId: 'spec-kit-plus:pack-skill-fixture',
      }),
      expect.objectContaining({
        workflowId: 'pack-skill-flow',
        phaseId: 'implement',
        field: 'skillBindings',
        reference: 'spec-kit-plus:pack-skill-fixture',
        name: 'spec-kit-plus:pack-skill-fixture',
        namespace: 'spec-kit-plus',
        referenceId: 'spec-kit-plus:pack-skill-fixture',
      }),
    ]))
    expect(dependencies.skills[0]?.referenceMappings).toHaveLength(2)
    expect(dependencies.requiredHostTools).toEqual([
      { name: 'Bash', supported: true },
      { name: 'Read', supported: true },
    ])
  })

  test('packs user-prefixed skillBindings from real user skill directories', async () => {
    await writeSkill(process.env.CLAUDE_SKILLS_DIR!, 'brainstorming')
    await writeSkill(process.env.CLAUDE_SKILLS_DIR!, 'managed-code-review-skill', {
      referenceId: 'managed:code-review-skill',
    })

    const dependencies = await buildSelfContainedWorkflowPackDependencies([
      workflowWithPhase({
        skillBindings: ['user:brainstorming', 'user:managed-code-review-skill'],
      }),
    ])

    expect(dependencies.entrypoints.sort()).toEqual([
      'skills/user-brainstorming/SKILL.md',
      'skills/user-managed-code-review-skill/SKILL.md',
    ])
    expect(Object.keys(dependencies.entries)).toEqual(expect.arrayContaining([
      'skills/user-brainstorming/SKILL.md',
      'skills/user-brainstorming/guide.md',
      'skills/user-managed-code-review-skill/SKILL.md',
      'skills/user-managed-code-review-skill/guide.md',
    ]))
    expect(dependencies.skills.map((skill) => skill.identity).sort()).toEqual([
      'user:brainstorming',
      'user:managed-code-review-skill',
    ])
    expect(dependencies.skills.flatMap((skill) => skill.referenceMappings)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: 'skillBindings',
        reference: 'user:brainstorming',
        name: 'user:brainstorming',
        namespace: 'user',
        referenceId: 'user:brainstorming',
      }),
      expect.objectContaining({
        field: 'skillBindings',
        reference: 'user:managed-code-review-skill',
        name: 'user:managed-code-review-skill',
        namespace: 'user',
        referenceId: 'user:managed-code-review-skill',
      }),
    ]))
  })

  test('blocks export when a referenced workflow skill has no real packable SKILL.md directory', async () => {
    await expect(buildSelfContainedWorkflowPackDependencies([
      workflowWithPhase({
        skills: [{ name: 'spec-kit-plus:not-installed', namespace: 'spec-kit-plus', referenceId: 'spec-kit-plus:not-installed' }],
      }),
    ])).rejects.toMatchObject({
      blockers: [expect.objectContaining({
        workflowId: 'pack-skill-flow',
        phaseId: 'implement',
        kind: 'skill',
        reference: 'spec-kit-plus:not-installed',
      })],
    } satisfies Partial<WorkflowPackExportDependencyError>)
  })

  test('plans a conflict when a pack repeats the same skill identity with different content hashes', async () => {
    const zip = await makeZipArchive({
      'skills/shared-a/SKILL.md': '---\nname: "Shared A"\nreferenceId: "shared-skill"\n---\n# Shared A\n',
      'skills/shared-b/SKILL.md': '---\nname: "Shared B"\nreferenceId: "shared-skill"\n---\n# Shared B\n',
    })

    const plan = await buildWorkflowPackSkillInstallPlan(zip, {
      packId: 'duplicate-identity-pack',
      entrypoints: {
        skills: ['skills/shared-a/SKILL.md', 'skills/shared-b/SKILL.md'],
      },
      dependencies: {
        packagedSkills: [
          {
            id: 'shared-a',
            identity: 'shared-skill',
            safeName: 'shared-skill',
            entrypoint: 'skills/shared-a/SKILL.md',
            root: 'skills/shared-a',
            contentHash: 'sha256-a',
          },
          {
            id: 'shared-b',
            identity: 'shared-skill',
            safeName: 'shared-skill',
            entrypoint: 'skills/shared-b/SKILL.md',
            root: 'skills/shared-b',
            contentHash: 'sha256-b',
          },
        ],
      },
    })

    expect(plan).toEqual([
      expect.objectContaining({ identity: 'shared-skill', status: 'install', entrypoint: 'skills/shared-a/SKILL.md' }),
      expect.objectContaining({
        identity: 'shared-skill',
        status: 'conflict',
        entrypoint: 'skills/shared-b/SKILL.md',
        message: 'Pack contains the same skill identity with different content.',
      }),
    ])
  })

  test('skips duplicate same-content skill entrypoints during import planning', async () => {
    const zip = await makeZipArchive({
      'skills/reused-skill/SKILL.md': '---\nname: "Reused Skill"\nreferenceId: "reused-skill"\n---\n# Reused Skill\n',
    })

    const plan = await buildWorkflowPackSkillInstallPlan(zip, {
      packId: 'duplicate-same-content-pack',
      entrypoints: {
        skills: ['skills/reused-skill/SKILL.md', 'skills/reused-skill/SKILL.md'],
      },
      dependencies: {
        packagedSkills: [{
          id: 'reused-skill',
          identity: 'reused-skill',
          safeName: 'reused-skill',
          entrypoint: 'skills/reused-skill/SKILL.md',
          root: 'skills/reused-skill',
          contentHash: 'sha256-reused',
        }],
      },
    })

    expect(plan).toEqual([
      expect.objectContaining({
        identity: 'reused-skill',
        status: 'install',
        entrypoint: 'skills/reused-skill/SKILL.md',
      }),
    ])
  })
})
