import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'

import { Settings } from './Settings'
import { useSettingsStore } from '../stores/settingsStore'
import { useUIStore } from '../stores/uiStore'
import { zh } from '../i18n/locales/zh'

vi.mock('../stores/providerStore', () => ({
  useProviderStore: () => ({
    providers: [],
    activeId: null,
    hasLoadedProviders: true,
    presets: [],
    isLoading: false,
    isPresetsLoading: false,
    fetchProviders: vi.fn(),
    fetchPresets: vi.fn(),
    deleteProvider: vi.fn(),
    activateProvider: vi.fn(),
    activateOfficial: vi.fn(),
    testProvider: vi.fn(),
  }),
}))

vi.mock('../components/settings/ClaudeOfficialLogin', () => ({
  ClaudeOfficialLogin: () => <div data-testid="claude-official-login" />,
}))

vi.mock('./AdapterSettings', () => ({
  AdapterSettings: () => <div>Adapter Settings</div>,
}))

vi.mock('./ActivitySettings', () => ({
  ActivitySettings: () => <div>Activity Settings</div>,
}))

vi.mock('./ComputerUseSettings', () => ({
  ComputerUseSettings: () => <div>Computer Use Settings</div>,
}))

vi.mock('./McpSettings', () => ({
  McpSettings: () => <div>MCP Settings</div>,
}))

vi.mock('./TerminalSettings', () => ({
  TerminalSettings: () => <div>Terminal Settings</div>,
}))

vi.mock('./DiagnosticsSettings', () => ({
  DiagnosticsSettings: () => <div>Diagnostics Settings</div>,
}))

vi.mock('./MemorySettings', () => ({
  MemorySettings: () => <div>Memory Settings</div>,
}))

vi.mock('../components/workflow/WorkflowTemplateManager', () => ({
  WorkflowTemplateManager: () => <div data-testid="workflow-template-manager">Workflow Template Manager</div>,
}))

vi.mock('../stores/agentStore', () => ({
  useAgentStore: () => ({
    activeAgents: [],
    allAgents: [],
    isLoading: false,
    error: null,
    selectedAgent: null,
    fetchAgents: vi.fn(),
    selectAgent: vi.fn(),
  }),
}))

vi.mock('../stores/skillStore', () => ({
  useSkillStore: () => ({
    selectedSkill: null,
  }),
}))

vi.mock('../components/skills/SkillList', () => ({
  SkillList: () => <div>Skill List</div>,
}))

vi.mock('../components/skills/SkillDetail', () => ({
  SkillDetail: () => <div>Skill Detail</div>,
}))

vi.mock('../stores/pluginStore', () => ({
  usePluginStore: () => ({
    selectedPlugin: null,
  }),
}))

vi.mock('../components/plugins/PluginList', () => ({
  PluginList: () => <div>Plugin List</div>,
}))

vi.mock('../components/plugins/PluginDetail', () => ({
  PluginDetail: () => <div>Plugin Detail</div>,
}))

vi.mock('../stores/updateStore', () => ({
  useUpdateStore: () => ({
    status: 'idle',
    availableVersion: null,
    releaseNotes: null,
    progressPercent: 0,
    downloadedBytes: 0,
    totalBytes: null,
    error: null,
    checkedAt: null,
    initialize: vi.fn(),
    checkForUpdates: vi.fn(),
    installUpdate: vi.fn(),
  }),
}))

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,h5qr'),
  },
}))

describe('Settings Workflows tab', () => {
  beforeEach(() => {
    useSettingsStore.setState({ locale: 'en' })
    useUIStore.setState({ pendingSettingsTab: null })
  })

  it('routes to the Workflows tab without removing existing Settings tabs', () => {
    render(<Settings />)

    expect(screen.getByRole('button', { name: /Providers/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /General/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Workflows/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /About/ })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Workflows/ }))

    expect(screen.getByRole('heading', { name: 'Workflows' })).toBeInTheDocument()
    expect(screen.getByText('Manage workflow templates and staged execution contracts.')).toBeInTheDocument()
    expect(screen.getByTestId('workflow-template-manager')).toBeInTheDocument()
  })

  it('uses pendingSettingsTab to open Workflows and clears the pending request', () => {
    useUIStore.setState({ pendingSettingsTab: 'workflows' })

    render(<Settings />)

    expect(screen.getByRole('heading', { name: 'Workflows' })).toBeInTheDocument()
    expect(useUIStore.getState().pendingSettingsTab).toBeNull()
  })

  it('uses a localized Chinese Workflows tab label', () => {
    expect(zh['settings.tab.workflows']).toBe('工作流')
  })
})
