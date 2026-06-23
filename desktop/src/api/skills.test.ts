import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
}))

vi.mock('./client', () => ({
  api: {
    get: getMock,
  },
}))

import { skillsApi } from './skills'
import type { SkillsCatalogResponse, SkillsListResponse } from '../types/skill'

describe('skillsApi', () => {
  beforeEach(() => {
    getMock.mockReset()
  })

  it('lists installed skills with an encoded workspace query and long timeout', async () => {
    const response: SkillsListResponse = {
      skills: [{
        name: 'release-checklist',
        displayName: 'Release Checklist',
        description: 'Verify release readiness.',
        source: 'project',
        userInvocable: true,
        version: '1.0.0',
        contentLength: 400,
        hasDirectory: true,
      }],
    }
    getMock.mockResolvedValue(response)

    const result = await skillsApi.list('F:\\workspace\\release app')

    expect(getMock).toHaveBeenCalledWith(
      '/api/skills?cwd=F%3A%5Cworkspace%5Crelease+app',
      { timeout: 120_000 },
    )
    expect(result).toBe(response)
  })

  it('requests the metadata-only catalog without a workspace when cwd is omitted', async () => {
    const response: SkillsCatalogResponse = {
      skills: [{
        name: 'telegram:access',
        displayName: 'Telegram Access',
        description: 'Plugin workflow helper.',
        source: 'plugin',
        catalogStatus: 'plugin-disabled',
        userInvocable: true,
        version: '2.1.0',
        hasDirectory: true,
        pluginName: 'telegram',
        provenance: {
          pluginName: 'telegram',
          referenceId: 'telegram:access',
        },
      }],
    }
    getMock.mockResolvedValue(response)

    const result = await skillsApi.catalog()

    expect(getMock).toHaveBeenCalledWith('/api/skills?catalogOnly=true', { timeout: 120_000 })
    expect(result).toBe(response)
  })

  it('requests the metadata-only catalog with both workspace and catalog flags', async () => {
    getMock.mockResolvedValue({ skills: [] })

    await skillsApi.catalog('/workspace/project')

    expect(getMock).toHaveBeenCalledWith(
      '/api/skills?cwd=%2Fworkspace%2Fproject&catalogOnly=true',
      { timeout: 120_000 },
    )
  })

  it('requests workflow-safe catalog filtering without loading skill contents', async () => {
    const response: SkillsCatalogResponse = {
      skills: [{
        name: 'release-notifier',
        displayName: 'Release Notifier',
        description: 'Notify release stakeholders.',
        source: 'plugin',
        catalogStatus: 'plugin-disabled',
        userInvocable: true,
        version: '2.1.0',
        hasDirectory: true,
        pluginName: 'release-tools',
        referenceId: 'release-tools:notifier',
        provenance: {
          pluginName: 'release-tools',
          referenceId: 'release-tools:notifier',
          version: '2.1.0',
          contentHash: 'sha256:notifier',
        },
      }],
    }
    getMock.mockResolvedValue(response)

    const catalog = skillsApi.catalog as (
      cwd?: string,
      options?: { workflowOnly?: boolean },
    ) => Promise<SkillsCatalogResponse>
    const result = await catalog('/workspace/project', { workflowOnly: true })

    expect(getMock).toHaveBeenCalledWith(
      '/api/skills?cwd=%2Fworkspace%2Fproject&catalogOnly=true&workflowOnly=true',
      { timeout: 120_000 },
    )
    expect(result.skills[0]).toMatchObject({
      catalogStatus: 'plugin-disabled',
      pluginName: 'release-tools',
      referenceId: 'release-tools:notifier',
      provenance: expect.objectContaining({
        contentHash: 'sha256:notifier',
      }),
    })
  })

  it('retrieves detail with encoded skill identity and workspace query', async () => {
    const response = {
      detail: {
        meta: {
          name: 'release checklist',
          description: 'Verify release readiness.',
          source: 'user',
          userInvocable: true,
          contentLength: 200,
          hasDirectory: true,
        },
        tree: [],
        files: [],
        skillRoot: '/skills/release checklist',
      },
    }
    getMock.mockResolvedValue(response)

    const result = await skillsApi.detail('user', 'release checklist', '/workspace/project')

    expect(getMock).toHaveBeenCalledWith(
      '/api/skills/detail?source=user&name=release+checklist&cwd=%2Fworkspace%2Fproject',
      { timeout: 120_000 },
    )
    expect(result).toBe(response)
  })
})
