import { describe, expect, test } from 'bun:test'
import { resolveWorkflowPhaseSkills } from './workflowPhaseSkillResolver.js'

const checkedAt = '2026-05-29T00:00:00.000Z'

describe('workflow phase skill resolver', () => {
  test('returns available when a names-first reference matches one catalog skill', async () => {
    const result = await resolveWorkflowPhaseSkills({
      checkedAt,
      references: [{ name: 'tdd-workflow' }],
      catalog: [
        {
          name: 'tdd-workflow',
          displayName: 'TDD Workflow',
          source: 'project',
        },
      ],
    })

    expect(result).toMatchObject({
      schemaVersion: 1,
      resolvedAt: checkedAt,
      resolutions: [
        {
          reference: {
            name: 'tdd-workflow',
            mode: 'recommended',
          },
          status: 'available',
          checkedAt,
          resolvedSkill: {
            name: 'tdd-workflow',
            displayName: 'TDD Workflow',
            source: 'project',
          },
        },
      ],
    })
  })

  test('returns stable identity and provenance for local, bundled, plugin, managed, and mcp skills', async () => {
    const result = await resolveWorkflowPhaseSkills({
      checkedAt,
      references: [
        { name: 'project-tdd', source: 'project', referenceId: 'project:project-tdd' },
        { name: 'bundled-review', source: 'bundled', contentHash: 'sha256:bundled-review' },
        { name: 'plugin-audit', source: 'plugin', pluginName: 'quality-pack', namespace: 'quality' },
        { name: 'managed-release', source: 'managed', version: '2.1.0' },
        { name: 'mcp-context', source: 'mcp', referenceId: 'mcp:context7:prompt/context' },
      ],
      catalog: [
        {
          name: 'project-tdd',
          displayName: 'Project TDD',
          source: 'project',
          referenceId: 'project:project-tdd',
          sourcePath: '.agents/skills/project-tdd/SKILL.md',
        },
        {
          name: 'bundled-review',
          displayName: 'Bundled Review',
          source: 'bundled',
          contentHash: 'sha256:bundled-review',
          sourcePath: 'openai-bundled/review/SKILL.md',
        },
        {
          name: 'plugin-audit',
          displayName: 'Plugin Audit',
          source: 'plugin',
          pluginName: 'quality-pack',
          namespace: 'quality',
          sourcePath: 'plugins/quality-pack/audit/SKILL.md',
        },
        {
          name: 'managed-release',
          displayName: 'Managed Release',
          source: 'managed',
          version: '2.1.0',
          referenceId: 'managed:release',
        },
        {
          name: 'mcp-context',
          displayName: 'Context MCP',
          source: 'mcp',
          referenceId: 'mcp:context7:prompt/context',
          namespace: 'context7',
        },
      ],
    })

    expect(result.resolutions).toEqual([
      expect.objectContaining({
        status: 'available',
        resolvedSkill: expect.objectContaining({ name: 'project-tdd', source: 'project' }),
        provenance: expect.objectContaining({
          referenceId: 'project:project-tdd',
          sourcePath: '.agents/skills/project-tdd/SKILL.md',
        }),
      }),
      expect.objectContaining({
        status: 'available',
        resolvedSkill: expect.objectContaining({ name: 'bundled-review', source: 'bundled' }),
        provenance: expect.objectContaining({
          contentHash: 'sha256:bundled-review',
          sourcePath: 'openai-bundled/review/SKILL.md',
        }),
      }),
      expect.objectContaining({
        status: 'available',
        resolvedSkill: expect.objectContaining({
          name: 'plugin-audit',
          source: 'plugin',
          pluginName: 'quality-pack',
        }),
        provenance: expect.objectContaining({
          namespace: 'quality',
          sourcePath: 'plugins/quality-pack/audit/SKILL.md',
        }),
      }),
      expect.objectContaining({
        status: 'available',
        resolvedSkill: expect.objectContaining({ name: 'managed-release', source: 'managed' }),
        provenance: expect.objectContaining({
          version: '2.1.0',
          referenceId: 'managed:release',
        }),
      }),
      expect.objectContaining({
        status: 'available',
        resolvedSkill: expect.objectContaining({ name: 'mcp-context', source: 'mcp' }),
        provenance: expect.objectContaining({
          namespace: 'context7',
          referenceId: 'mcp:context7:prompt/context',
        }),
      }),
    ])
  })

  test('returns missing warning when no catalog skill matches a recommended reference', async () => {
    const result = await resolveWorkflowPhaseSkills({
      checkedAt,
      references: [{ name: 'missing-skill', reason: 'legacy advisory text' }],
      catalog: [],
    })

    expect(result.resolutions[0]).toMatchObject({
      reference: {
        name: 'missing-skill',
        mode: 'recommended',
        reason: 'legacy advisory text',
      },
      status: 'missing',
      diagnostic: {
        code: 'WORKFLOW_PHASE_SKILL_MISSING',
        severity: 'warning',
      },
    })
  })

  test('returns ambiguous warning with candidate summaries when names-first data matches multiple skills', async () => {
    const result = await resolveWorkflowPhaseSkills({
      checkedAt,
      references: [{ name: 'review' }],
      catalog: [
        { name: 'review', source: 'user' },
        { name: 'review', source: 'plugin', pluginName: 'quality-pack' },
      ],
    })

    expect(result.resolutions[0]).toMatchObject({
      status: 'ambiguous',
      candidates: [
        { name: 'review', source: 'user' },
        { name: 'review', source: 'plugin', pluginName: 'quality-pack' },
      ],
      diagnostic: {
        code: 'WORKFLOW_PHASE_SKILL_AMBIGUOUS',
        severity: 'warning',
      },
    })
  })

  test('returns unsupported-source warning without rewriting the skill binding to a plugin binding', async () => {
    const result = await resolveWorkflowPhaseSkills({
      checkedAt,
      references: [
        {
          name: 'remote-marketplace-skill',
          source: 'mcp',
          pluginName: 'not-primary-identity',
        },
      ],
      catalog: [],
      supportedSources: ['user', 'project', 'plugin'],
    })

    expect(result.resolutions[0]).toMatchObject({
      reference: {
        name: 'remote-marketplace-skill',
        source: 'mcp',
        pluginName: 'not-primary-identity',
      },
      status: 'unsupported-source',
      diagnostic: {
        code: 'WORKFLOW_PHASE_SKILL_UNSUPPORTED_SOURCE',
        severity: 'warning',
      },
    })
  })

  test('returns plugin-disabled warning for plugin-provided skills whose plugin is unavailable', async () => {
    const result = await resolveWorkflowPhaseSkills({
      checkedAt,
      references: [{ name: 'plugin-skill', source: 'plugin', pluginName: 'quality-pack' }],
      catalog: [
        {
          name: 'plugin-skill',
          source: 'plugin',
          pluginName: 'quality-pack',
          pluginEnabled: false,
        },
      ],
    })

    expect(result.resolutions[0]).toMatchObject({
      status: 'plugin-disabled',
      diagnostic: {
        code: 'WORKFLOW_PHASE_SKILL_PLUGIN_DISABLED',
        severity: 'warning',
      },
      reference: {
        name: 'plugin-skill',
        source: 'plugin',
        pluginName: 'quality-pack',
      },
    })
  })

  test('returns invalid-reference error for malformed references', async () => {
    const result = await resolveWorkflowPhaseSkills({
      checkedAt,
      references: [{ name: '   ' }],
      catalog: [],
    })

    expect(result.resolutions[0]).toMatchObject({
      status: 'invalid-reference',
      diagnostic: {
        code: 'WORKFLOW_PHASE_SKILL_INVALID_REFERENCE',
        severity: 'error',
      },
    })
  })
})
