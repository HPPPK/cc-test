import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { catalogMock, detailMock, listMock } = vi.hoisted(() => ({
  catalogMock: vi.fn(),
  detailMock: vi.fn(),
  listMock: vi.fn(),
}))

vi.mock('../api/skills', () => ({
  skillsApi: {
    catalog: catalogMock,
    detail: detailMock,
    list: listMock,
  },
}))

import { useSkillStore } from './skillStore'
import type { SkillCatalogItem, SkillDetail, SkillMeta } from '../types/skill'

const initialState = useSkillStore.getState()

const installedSkill: SkillMeta = {
  name: 'release-checklist',
  displayName: 'Release Checklist',
  description: 'Verify release readiness.',
  source: 'project',
  catalogStatus: 'available',
  userInvocable: true,
  version: '1.0.0',
  contentLength: 400,
  hasDirectory: true,
  contentHash: 'sha256-release',
  provenance: {
    sourcePath: '/workspace/.agents/skills/release-checklist/SKILL.md',
    contentHash: 'sha256-release',
  },
}

const catalogSkill: SkillCatalogItem = {
  name: 'telegram:access',
  displayName: 'Telegram Access',
  description: 'Plugin workflow helper.',
  source: 'plugin',
  catalogStatus: 'plugin-disabled',
  userInvocable: true,
  version: '2.1.0',
  hasDirectory: true,
  pluginName: 'telegram',
  referenceId: 'telegram:access',
  provenance: {
    pluginName: 'telegram',
    referenceId: 'telegram:access',
  },
}

const skillDetail: SkillDetail = {
  meta: installedSkill,
  tree: [{ name: 'SKILL.md', path: 'SKILL.md', type: 'file' }],
  files: [{
    path: 'SKILL.md',
    content: '# Release Checklist',
    language: 'markdown',
    isEntry: true,
  }],
  skillRoot: '/workspace/.agents/skills/release-checklist',
}

describe('skillStore', () => {
  beforeEach(() => {
    catalogMock.mockReset()
    detailMock.mockReset()
    listMock.mockReset()
    useSkillStore.setState({
      ...initialState,
      skills: [],
      catalog: [],
      selectedSkill: null,
      selectedSkillReturnTab: 'skills',
      isLoading: false,
      isCatalogLoading: false,
      isDetailLoading: false,
      error: null,
    })
  })

  afterEach(() => {
    useSkillStore.setState(initialState)
  })

  it('copies installed skills into the shared catalog after fetching skills', async () => {
    listMock.mockResolvedValue({ skills: [installedSkill] })

    await useSkillStore.getState().fetchSkills('/workspace/project')

    expect(listMock).toHaveBeenCalledWith('/workspace/project')
    expect(useSkillStore.getState()).toMatchObject({
      skills: [expect.objectContaining({
        ...installedSkill,
        description: 'Verify release readiness. available sha256-release',
      })],
      catalog: [expect.objectContaining({
        ...installedSkill,
        description: 'Verify release readiness. available sha256-release',
      })],
      isLoading: false,
      error: null,
    })
  })

  it('stores metadata-only catalog entries without replacing installed skills', async () => {
    useSkillStore.setState({ skills: [installedSkill] })
    catalogMock.mockResolvedValue({ skills: [catalogSkill] })

    await useSkillStore.getState().fetchCatalog('/workspace/project')

    expect(catalogMock).toHaveBeenCalledWith('/workspace/project', undefined)
    expect(useSkillStore.getState()).toMatchObject({
      skills: [expect.objectContaining({
        ...installedSkill,
        description: 'Verify release readiness. available sha256-release',
      })],
      catalog: [expect.objectContaining({
        ...catalogSkill,
        description: 'Plugin workflow helper. plugin-disabled telegram:access plugin disabled telegram',
      })],
      isCatalogLoading: false,
      error: null,
    })
  })

  it('records catalog fetch errors and clears the catalog loading flag', async () => {
    catalogMock.mockRejectedValue(new Error('catalog unavailable'))

    await useSkillStore.getState().fetchCatalog('/workspace/project')

    expect(useSkillStore.getState()).toMatchObject({
      catalog: [],
      isCatalogLoading: false,
      error: 'catalog unavailable',
    })
  })

  it('stores skill detail with the requested return tab', async () => {
    detailMock.mockResolvedValue({ detail: skillDetail })

    await useSkillStore.getState().fetchSkillDetail(
      'project',
      'release-checklist',
      '/workspace/project',
      'plugins',
    )

    expect(detailMock).toHaveBeenCalledWith('project', 'release-checklist', '/workspace/project')
    expect(useSkillStore.getState()).toMatchObject({
      selectedSkill: skillDetail,
      selectedSkillReturnTab: 'plugins',
      isDetailLoading: false,
      error: null,
    })
  })

  it('clears selected detail and returns to the skills tab', () => {
    useSkillStore.setState({
      selectedSkill: skillDetail,
      selectedSkillReturnTab: 'plugins',
    })

    useSkillStore.getState().clearSelection()

    expect(useSkillStore.getState()).toMatchObject({
      selectedSkill: null,
      selectedSkillReturnTab: 'skills',
    })
  })
})
