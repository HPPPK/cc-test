import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

import { expertsApi, type ExpertDefinition, type ExpertPackImportPreview, type ExpertPackSummary, type ExpertToolManifest } from '../../api/experts'
import { useExpertStore } from '../../stores/expertStore'
import { useSessionStore } from '../../stores/sessionStore'
import { ExpertSelectionDialog } from './ExpertSelectionDialog'

const hostQuestionTool = {
  id: 'AskUserQuestion',
  name: 'AskUserQuestion',
  purpose: '向你确认关键选择',
}

const writerTool = {
  id: 'ExpertMaterialWriter',
  name: 'ExpertMaterialWriter',
  purpose: '保存专家材料',
}

const localExecutableTool: ExpertToolManifest = {
  id: 'migration-draft',
  name: 'migration-draft',
  type: 'packageLocalExecutable',
  purpose: '生成迁移评估草稿',
  entrypoint: 'tools/migration-draft.json',
  permissions: [{ id: 'project-read', description: '读取你选择的项目资料' }],
  command: 'node draft.js',
  network: 'none',
}

function makeExpert(overrides: Partial<ExpertDefinition> = {}): ExpertDefinition {
  return {
    id: 'repo-health-check',
    name: '项目体检专家',
    description: '整理项目现状并生成报告',
    statusLabel: '可使用',
    packId: 'builtin-experts',
    packName: '内置专家基础包',
    packVersion: '1.0.0',
    entrypoint: 'experts/repo-health-check/expert.json',
    promptPaths: {},
    formPaths: ['forms/repo-health.json'],
    skillIds: ['repo-health', 'report-writer'],
    hostTools: [hostQuestionTool, writerTool],
    permissions: [{ id: 'project-read', description: '读取你选择的项目资料' }],
    tools: [],
    portable: true,
    intakeFlow: {
      version: 1,
      steps: [{ type: 'form', id: 'materials', title: '请补充材料', fields: [{ id: 'notes', kind: 'textarea', label: '补充说明' }] }],
    },
    ...overrides,
  }
}

function makePack(experts: ExpertDefinition[], overrides: Partial<ExpertPackSummary> = {}): ExpertPackSummary {
  return {
    packId: experts[0]?.packId ?? 'builtin-experts',
    name: experts[0]?.packName ?? '内置专家基础包',
    version: experts[0]?.packVersion ?? '1.0.0',
    description: '内置专家集合',
    storage: { kind: 'zip', path: 'builtin-experts.zip' },
    experts,
    tools: [],
    importedAt: '2026-07-08T00:00:00.000Z',
    ...overrides,
  }
}

describe('ExpertSelectionDialog package management', () => {
  const initialExpertState = useExpertStore.getInitialState()
  const initialSessionState = useSessionStore.getInitialState()

  beforeEach(() => {
    useExpertStore.setState(initialExpertState, true)
    useSessionStore.setState(initialSessionState, true)
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    useExpertStore.setState(initialExpertState, true)
    useSessionStore.setState(initialSessionState, true)
  })

  it('shows installed expert package details in plain Chinese copy', () => {
    const primaryExpert = makeExpert()
    const secondExpert = makeExpert({
      id: 'product-brief',
      name: '需求梳理专家',
      formPaths: [],
      skillIds: ['product-brief'],
      hostTools: [hostQuestionTool],
      permissions: [],
      intakeFlow: undefined,
    })
    const loadExperts = vi.fn().mockResolvedValue(undefined)

    useExpertStore.setState({
      experts: [primaryExpert, secondExpert],
      packs: [makePack([primaryExpert, secondExpert])],
      loadExperts,
      exportPack: vi.fn().mockResolvedValue(undefined),
    })

    render(<ExpertSelectionDialog open onClose={vi.fn()} projectRoot="C:/repo" />)

    expect(screen.getByText('已安装专家包详情')).toBeInTheDocument()
    expect(screen.getByText(/包含 2 个专家、3 项技能和 2 个材料表单/)).toBeInTheDocument()
    expect(screen.getByText(/可移植：可随 ZIP 一起备份或迁移/)).toBeInTheDocument()
    expect(screen.getByText('工具和权限')).toBeInTheDocument()
    expect(screen.getByText(/向你提问并等待选择/)).toBeInTheDocument()
    expect(screen.getByText(/保存专家生成的材料/)).toBeInTheDocument()
    expect(screen.getAllByText(/第一阶段不会运行包内代码/).length).toBeGreaterThan(0)

    const visibleCopy = screen.getByTestId('expert-selection-dialog').textContent ?? ''
    expect(visibleCopy).not.toMatch(/registry|schema|adapter|capability/i)
    expect(visibleCopy).not.toContain('AskUserQuestion')
  })

  it('keeps selections independent when two listed experts share an expert ID', () => {
    const firstExpert = makeExpert({
      id: 'shared-expert',
      name: 'First shared expert',
      packId: 'first-pack',
      packName: 'First package',
    })
    const secondExpert = makeExpert({
      id: 'shared-expert',
      name: 'Replacement shared expert',
      packId: 'replacement-pack',
      packName: 'Replacement package',
    })

    useExpertStore.setState({
      experts: [firstExpert, secondExpert],
      packs: [makePack([firstExpert]), makePack([secondExpert])],
      loadExperts: vi.fn().mockResolvedValue(undefined),
      exportPack: vi.fn().mockResolvedValue(undefined),
    })

    render(<ExpertSelectionDialog open onClose={vi.fn()} projectRoot="C:/repo" />)

    const firstCard = screen.getByRole('button', { name: /First shared expert/ })
    const secondCard = screen.getByRole('button', { name: /Replacement shared expert/ })
    expect(firstCard).toHaveClass('shadow-sm')
    expect(secondCard).not.toHaveClass('shadow-sm')

    fireEvent.click(secondCard)

    expect(firstCard).not.toHaveClass('shadow-sm')
    expect(secondCard).toHaveClass('shadow-sm')
  })

  it('previews and imports zip packages without exposing technical package words', async () => {
    const installedExpert = makeExpert()
    const importedExpert = makeExpert({
      id: 'migration-refactor',
      name: '迁移评估专家',
      packId: 'migration-pack',
      packName: '迁移专家包',
      packVersion: '2.0.0',
      formPaths: [],
      skillIds: ['migration-plan'],
      hostTools: [hostQuestionTool],
      permissions: [],
      tools: [localExecutableTool],
      portable: true,
      intakeFlow: undefined,
    })
    const preview: ExpertPackImportPreview = {
      pack: makePack([importedExpert], {
        packId: 'migration-pack',
        name: '迁移专家包',
        version: '2.0.0',
        description: '帮助评估迁移方案',
        storage: { kind: 'zip', path: '' },
        tools: [localExecutableTool],
      }),
      experts: [importedExpert],
      summary: '这个专家包包含 1 个专家、1 个技能、0 个表单。',
      warnings: ['schema capability adapter registry'],
      canImport: true,
    }
    const loadExperts = vi.fn().mockResolvedValue(undefined)
    vi.spyOn(expertsApi, 'previewImport').mockResolvedValue(preview)
    vi.spyOn(expertsApi, 'importPack').mockResolvedValue(preview)

    useExpertStore.setState({
      experts: [installedExpert],
      packs: [makePack([installedExpert])],
      loadExperts,
      exportPack: vi.fn().mockResolvedValue(undefined),
    })

    const { container } = render(<ExpertSelectionDialog open onClose={vi.fn()} projectRoot="C:/repo" />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement

    fireEvent.change(input, { target: { files: [new File(['demo'], 'experts.zip', { type: 'application/zip' })] } })

    expect(await screen.findByText('准备导入：迁移专家包')).toBeInTheDocument()
    expect(screen.getByText(/这个文件包含 1 个专家、1 项技能和 0 个材料表单/)).toBeInTheDocument()
    expect(screen.getByText(/包内可运行工具：生成迁移评估草稿/)).toBeInTheDocument()
    expect(screen.getAllByText(/读取你选择的项目资料/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/第一阶段不会运行包内代码/).length).toBeGreaterThan(0)

    const previewCopy = screen.getByTestId('expert-selection-dialog').textContent ?? ''
    expect(previewCopy).not.toMatch(/registry|schema|adapter|capability/i)

    fireEvent.click(screen.getByRole('button', { name: '确认导入' }))

    await waitFor(() => expect(expertsApi.importPack).toHaveBeenCalledWith('ZGVtbw=='))
    expect(loadExperts).toHaveBeenCalled()
    expect(await screen.findByText('已导入「迁移专家包」，现在可以在列表里选择。')).toBeInTheDocument()
  })
})
