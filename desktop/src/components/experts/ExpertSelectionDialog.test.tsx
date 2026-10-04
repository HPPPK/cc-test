import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

import type { ExpertDefinition, ExpertPackSummary, ExpertToolManifest } from '../../api/experts'
import { useExpertStore } from '../../stores/expertStore'
import { useSessionStore } from '../../stores/sessionStore'
import { ExpertSelectionDialog } from './ExpertSelectionDialog'

const hostQuestionTool = {
  id: 'AskUserQuestion',
  name: 'AskUserQuestion',
  purpose: 'Ask the user to confirm a key choice',
}

const localExecutableTool: ExpertToolManifest = {
  id: 'migration-draft',
  name: 'migration-draft',
  type: 'packageLocalExecutable',
  purpose: 'Generate a migration assessment draft',
  entrypoint: 'tools/migration-draft.json',
  permissions: [{ id: 'project-read', description: 'Read the project material you selected' }],
  command: 'node draft.js',
  network: 'none',
}

function makeExpert(overrides: Partial<ExpertDefinition> = {}): ExpertDefinition {
  return {
    id: 'repo-health-check',
    name: 'Project health expert',
    description: 'Summarize the current project and turn it into an actionable report.',
    statusLabel: 'Ready',
    categoryId: 'development',
    tags: ['Architecture', 'Quality'],
    profile: {
      avatar: '🧭',
      tagline: 'See the project clearly before changing it.',
      soul: { whoIAm: 'I turn an unfamiliar codebase into a safe plan.', howITalk: 'Clear and concise.', boundaries: ['Do not change code automatically'] },
      starterPrompts: ['Help me understand this project.', 'Find the riskiest part of this repository.'],
    },
    packId: 'builtin-experts',
    packName: 'Built-in expert basics',
    packVersion: '1.0.0',
    entrypoint: 'experts/repo-health-check/expert.json',
    promptPaths: {},
    formPaths: ['forms/repo-health.json'],
    skillIds: ['repo-health', 'report-writer'],
    hostTools: [hostQuestionTool],
    permissions: [{ id: 'project-read', description: 'Read the project material you selected' }],
    tools: [],
    portable: true,
    intakeFlow: undefined,
    ...overrides,
  }
}

function makePack(experts: ExpertDefinition[], overrides: Partial<ExpertPackSummary> = {}): ExpertPackSummary {
  return {
    packId: experts[0]?.packId ?? 'builtin-experts',
    name: experts[0]?.packName ?? 'Built-in expert basics',
    version: experts[0]?.packVersion ?? '1.0.0',
    description: 'Built-in expert collection',
    storage: { kind: 'zip', path: 'builtin-experts.zip' },
    experts,
    tools: [],
    importedAt: '2026-07-08T00:00:00.000Z',
    ...overrides,
  }
}

describe('ExpertSelectionDialog marketplace', () => {
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

  it('renders an expert marketplace without import controls', () => {
    const expert = makeExpert()
    useExpertStore.setState({
      experts: [expert],
      packs: [makePack([expert])],
      categories: [{ id: 'development', name: 'Development' }],
      loadExperts: vi.fn().mockResolvedValue(undefined),
      exportPack: vi.fn().mockResolvedValue(undefined),
    })

    const { container } = render(<ExpertSelectionDialog open onClose={vi.fn()} projectRoot="C:/repo" />)

    expect(screen.getByTestId('expert-marketplace')).toBeInTheDocument()
    const dialogShell = screen.getByTestId('expert-selection-dialog').firstElementChild
    expect(dialogShell).toHaveClass('w-[1150px]', 'h-[680px]')
    expect(screen.getByRole('heading', { name: '专家广场' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Development' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Project health expert' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '导入专家包' })).not.toBeInTheDocument()
    expect(container.querySelector('input[type="file"]')).toBeNull()
  })

  it('filters marketplace cards by category and search text', () => {
    const productExpert = makeExpert({ id: 'product-research', name: 'Product research expert', categoryId: 'product', tags: ['Commercial'] })
    const developmentExpert = makeExpert({ id: 'repo-health-check', name: 'Development review expert', categoryId: 'development', tags: ['Code'] })
    useExpertStore.setState({
      experts: [productExpert, developmentExpert],
      packs: [makePack([productExpert]), makePack([developmentExpert])],
      categories: [{ id: 'product', name: 'Product' }, { id: 'development', name: 'Development' }],
      loadExperts: vi.fn().mockResolvedValue(undefined),
      exportPack: vi.fn().mockResolvedValue(undefined),
    })

    render(<ExpertSelectionDialog open onClose={vi.fn()} projectRoot="C:/repo" />)
    fireEvent.click(screen.getByRole('button', { name: 'Product' }))
    expect(screen.getByRole('heading', { name: 'Product research expert' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Development review expert' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '全部' }))
    fireEvent.change(screen.getByRole('textbox', { name: '搜索专家' }), { target: { value: 'Code' } })
    expect(screen.getByRole('heading', { name: 'Development review expert' })).toBeInTheDocument()
  })

  it('opens a detail page where add enters expert mode and share exports the selected package', async () => {
    const expert = makeExpert({ tools: [localExecutableTool] })
    const exportPack = vi.fn().mockResolvedValue({ format: 'zip-pack' })
    const onEnterExpert = vi.fn().mockResolvedValue(undefined)
    useExpertStore.setState({
      experts: [expert],
      packs: [makePack([expert], { tools: [localExecutableTool] })],
      loadExperts: vi.fn().mockResolvedValue(undefined),
      exportPack,
    })

    render(<ExpertSelectionDialog open onClose={vi.fn()} projectRoot="C:/repo" onEnterExpert={onEnterExpert} />)
    fireEvent.click(screen.getByRole('button', { name: /Project health expert/ }))

    const detail = screen.getByTestId('expert-detail')
    expect(detail).toHaveTextContent('See the project clearly before changing it.')
    expect(detail).toHaveTextContent('Generate a migration assessment draft')
    expect(detail).toHaveTextContent('Read the project material you selected')

    fireEvent.click(screen.getByRole('button', { name: '导出这个专家包' }))
    await waitFor(() => expect(exportPack).toHaveBeenCalledWith('builtin-experts'))

    fireEvent.click(screen.getByRole('button', { name: '进入专家 Mode' }))
    await waitFor(() => expect(onEnterExpert).toHaveBeenCalledWith(expert))
  })


  it('requires explicit consent before connecting a package-authorized Chrome or Edge debugger', async () => {
    const expert = makeExpert({
      researchBrowserPolicy: {
        sharePlaywrightSessionAcrossAgents: true,
        allowUserAuthorizedCdp: true,
        forceVisiblePlaywright: true,
      },
    })
    const onEnterExpert = vi.fn().mockResolvedValue(undefined)
    useExpertStore.setState({
      experts: [expert],
      packs: [makePack([expert])],
      loadExperts: vi.fn().mockResolvedValue(undefined),
      exportPack: vi.fn().mockResolvedValue(undefined),
    })

    render(<ExpertSelectionDialog open onClose={vi.fn()} projectRoot="C:/repo" onEnterExpert={onEnterExpert} />)
    fireEvent.click(screen.getByRole('button', { name: /Project health expert/ }))
    expect(screen.getByTestId('expert-browser-connection-options')).toHaveTextContent('不会带入你日常 Chrome 的登录状态、Cookie、扩展或“浏览器扩展型 VPN/代理”')
    fireEvent.click(screen.getByLabelText(/连接我主动开启的 Chrome/))
    expect(screen.getByTestId('expert-browser-connection-options')).toHaveTextContent('请在这个专用调试 Profile 中自行启用同一 VPN/代理')
    expect(screen.getByRole('button', { name: '进入专家 Mode' })).toBeDisabled()

    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: '进入专家 Mode' }))

    await waitFor(() => expect(onEnterExpert).toHaveBeenCalledWith(expert, {
      researchBrowserConnection: {
        kind: 'cdp',
        browser: 'chrome',
        endpoint: 'http://127.0.0.1:9222',
        userAuthorized: true,
      },
    }))
  })

  it('keeps package identity when experts share an expert id', () => {
    const firstExpert = makeExpert({ id: 'shared-expert', name: 'First shared expert', packId: 'first-pack', packName: 'First package' })
    const secondExpert = makeExpert({ id: 'shared-expert', name: 'Second shared expert', packId: 'replacement-pack', packName: 'Replacement package' })
    useExpertStore.setState({
      experts: [firstExpert, secondExpert],
      packs: [makePack([firstExpert]), makePack([secondExpert])],
      loadExperts: vi.fn().mockResolvedValue(undefined),
      exportPack: vi.fn().mockResolvedValue(undefined),
    })

    render(<ExpertSelectionDialog open onClose={vi.fn()} projectRoot="C:/repo" />)
    fireEvent.click(screen.getByRole('button', { name: /Second shared expert/ }))

    expect(screen.getByTestId('expert-detail')).toHaveTextContent('Replacement package')
  })

  it('offers a session-only managed presentation choice and omits it for a user-authorized CDP browser', async () => {
    const expert = makeExpert({
      researchBrowserPolicy: {
        sharePlaywrightSessionAcrossAgents: false,
        allowUserAuthorizedCdp: true,
        managedPresentationDefault: 'assistable_background',
        allowManagedPresentationChoice: true,
      },
    })
    const onEnterExpert = vi.fn().mockResolvedValue(undefined)
    useExpertStore.setState({
      experts: [expert],
      packs: [makePack([expert])],
      loadExperts: vi.fn().mockResolvedValue(undefined),
      exportPack: vi.fn().mockResolvedValue(undefined),
    })

    render(<ExpertSelectionDialog open onClose={vi.fn()} projectRoot="C:/repo" onEnterExpert={onEnterExpert} />)
    fireEvent.click(screen.getByRole('button', { name: /Project health expert/ }))

    const background = screen.getByRole('radio', { name: /后台检索/ })
    expect(background).toBeChecked()
    expect(screen.getByText(/网站需要验证时会弹出提示/)).toHaveTextContent('恢复后软件不再自动最小化或收回')

    fireEvent.click(screen.getByLabelText(/连接我主动开启的 Chrome/))
    expect(screen.queryByRole('radio', { name: /后台检索/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /全程显示浏览器操作/ })).not.toBeInTheDocument()

    fireEvent.click(screen.getByLabelText(/软件自带 Chromium/))
    const visible = screen.getByRole('radio', { name: /全程显示浏览器操作/ })
    fireEvent.click(visible)
    fireEvent.click(screen.getByRole('button', { name: '进入专家 Mode' }))

    await waitFor(() => expect(onEnterExpert).toHaveBeenCalledWith(expert, {
      researchBrowserPresentation: 'always_visible',
    }))
  })
})
