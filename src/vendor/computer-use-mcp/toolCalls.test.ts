import { describe, expect, it } from 'bun:test'

import { DEFAULT_GRANT_FLAGS } from './types.js'
import { handleToolCall, _test } from './toolCalls.js'
import { buildComputerUseTools } from './tools.js'
import type {
  AppGrant,
  ComputerUseHostAdapter,
  ComputerUseOverrides,
  CuPermissionRequest,
  CuPermissionResponse,
} from './types.js'
import type { ComputerExecutor, InstalledApp } from './executor.js'

function textOf(result: Awaited<ReturnType<typeof handleToolCall>>): string {
  const first = result.content?.[0]
  return first && first.type === 'text' ? first.text : ''
}

function makeAdapter(installedApps: InstalledApp[]): ComputerUseHostAdapter {
  const executor: Partial<ComputerExecutor> = {
    capabilities: {
      screenshotFiltering: 'none',
      platform: 'win32',
      hostBundleId: 'cc-jiangxia',
    },
    listInstalledApps: async () => installedApps,
    previewHideSet: async () => [],
    listDisplays: async () => [],
    findWindowDisplays: async () => [],
    getAppIcon: async () => undefined,
  }

  return {
    serverName: 'computer-use',
    logger: {
      info: () => {},
      error: () => {},
      warn: () => {},
      debug: () => {},
      silly: () => {},
    },
    executor: executor as ComputerExecutor,
    ensureOsPermissions: async () => ({ granted: true }),
    isDisabled: () => false,
    getAutoUnhideEnabled: () => true,
    getSubGates: () => ({
      pixelValidation: false,
      clipboardPasteMultiline: false,
      mouseAnimation: false,
      hideBeforeAction: false,
      autoTargetDisplay: false,
      clipboardGuard: false,
    }),
    cropRawPatch: () => null,
  }
}

function makeOverrides(
  onPermissionRequest: (req: CuPermissionRequest) => Promise<CuPermissionResponse>,
  allowedApps: AppGrant[] = [],
): ComputerUseOverrides {
  return {
    allowedApps,
    grantFlags: DEFAULT_GRANT_FLAGS,
    coordinateMode: 'pixels',
    userDeniedBundleIds: [],
    onPermissionRequest,
  }
}

describe('computer-use request_access coding fallback guard', () => {
  const windowsTerminal: InstalledApp = {
    bundleId: 'WindowsTerminal.exe',
    displayName: 'Windows Terminal',
    path: 'C:\\Program Files\\WindowsApps\\WindowsTerminal.exe',
  }

  it('rejects terminal access when the stated reason is filesystem creation', async () => {
    let permissionRequests = 0
    const result = await handleToolCall(
      makeAdapter([windowsTerminal]),
      'request_access',
      {
        apps: ['Windows Terminal'],
        reason: 'Create a project folder with mkdir for the user.',
      },
      makeOverrides(async () => {
        permissionRequests += 1
        return { granted: [], denied: [], flags: DEFAULT_GRANT_FLAGS }
      }),
    )

    expect(result.isError).toBe(true)
    expect(result.telemetry?.error_kind).toBe('feature_unavailable')
    expect(textOf(result)).toContain('Computer Use is not available for filesystem, shell, or coding fallback tasks')
    expect(permissionRequests).toBe(0)
  })

  it('rejects Chinese folder creation fallback reasons before showing the permission dialog', async () => {
    let permissionRequests = 0
    const result = await handleToolCall(
      makeAdapter([windowsTerminal]),
      'request_access',
      {
        apps: ['Windows Terminal'],
        reason: '创建文件夹并运行命令初始化项目',
      },
      makeOverrides(async () => {
        permissionRequests += 1
        return { granted: [], denied: [], flags: DEFAULT_GRANT_FLAGS }
      }),
    )

    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('Use Bash, PowerShell, Write, or Edit')
    expect(permissionRequests).toBe(0)
  })

  it('still allows non-coding GUI inspection requests', async () => {
    let permissionRequests = 0
    const result = await handleToolCall(
      makeAdapter([windowsTerminal]),
      'request_access',
      {
        apps: ['Windows Terminal'],
        reason: 'Inspect the visible terminal output without typing.',
      },
      makeOverrides(async (req) => {
        permissionRequests += 1
        return {
          granted: req.apps
            .filter((app) => app.resolved)
            .map((app) => ({
              bundleId: app.resolved!.bundleId,
              displayName: app.resolved!.displayName,
              grantedAt: 1,
              tier: app.proposedTier,
            })),
          denied: [],
          flags: DEFAULT_GRANT_FLAGS,
        }
      }),
    )

    expect(result.isError).toBeUndefined()
    expect(permissionRequests).toBe(1)
    const body = JSON.parse(textOf(result)) as { granted: AppGrant[], tierGuidance?: string }
    expect(body.granted).toEqual([
      {
        bundleId: 'WindowsTerminal.exe',
        displayName: 'Windows Terminal',
        grantedAt: 1,
        tier: 'click',
      },
    ])
    expect(body.tierGuidance).toContain('NO typing')
  })

  it('warns the model not to use computer-use as a coding fallback in tool descriptions', () => {
    const tools = buildComputerUseTools({
      screenshotFiltering: 'none',
      platform: 'win32',
    }, 'pixels')
    const requestAccess = tools.find((tool) => tool.name === 'request_access')
    const batch = tools.find((tool) => tool.name === 'computer_batch')

    expect(requestAccess?.description).toContain('Do not use Computer Use as a fallback')
    expect(batch?.description).toContain('folder/file creation')
  })
})

describe('computer-use optional host metadata', () => {
  const grant: AppGrant = { bundleId: 'com.example.editor', displayName: 'Editor', grantedAt: 1, tier: 'full' }
  const geometry = { width: 100, height: 100, scaleFactor: 1, originX: 0, originY: 0 }

  it('omits displays without identities and keeps stable duplicate labels', () => {
    const labels = _test.uniqueDisplayLabels([{ ...geometry, label: 'Unknown' }, { ...geometry, displayId: 2, label: 'Monitor' }, { ...geometry, displayId: 1, label: 'Monitor' }])
    expect([...labels]).toEqual([[1, 'Monitor'], [2, 'Monitor (2)']])
  })

  it('never switches to an unidentifiable monitor', async () => {
    const adapter = makeAdapter([])
    adapter.executor.listDisplays = async () => [{ ...geometry, label: 'Unknown' }, { ...geometry, displayId: 1, label: 'Monitor' }]
    let pins = 0
    const overrides = makeOverrides(async () => ({ granted: [], denied: [], flags: DEFAULT_GRANT_FLAGS }))
    overrides.onDisplayPinned = () => { pins++ }
    const result = await _test.handleSwitchDisplay(adapter, { display: 'Unknown' }, overrides)
    expect(result.isError).toBe(true)
    expect(pins).toBe(0)
  })

  it('omits monitor notes when the screenshot has no display identity', async () => {
    const adapter = makeAdapter([])
    adapter.executor.listDisplays = async () => [{ ...geometry, displayId: 1 }, { ...geometry, displayId: 2 }]
    expect(await _test.buildMonitorNote(adapter, undefined, undefined, false)).toBeUndefined()
  })

  it('does not overwrite the selected display when an atomic screenshot has no identity', async () => {
    const adapter = makeAdapter([])
    adapter.getSubGates = () => ({ pixelValidation: false, clipboardPasteMultiline: false, mouseAnimation: false, hideBeforeAction: false, autoTargetDisplay: true, clipboardGuard: false })
    adapter.executor.resolvePrepareCapture = async () => ({ ...geometry, display: geometry, base64: 'aGVsbG8=', displayWidth: 100, displayHeight: 100, hidden: [] })
    let updates = 0
    const overrides = makeOverrides(async () => ({ granted: [], denied: [], flags: DEFAULT_GRANT_FLAGS }), [grant])
    overrides.selectedDisplayId = 2
    overrides.onResolvedDisplayUpdated = () => { updates++ }
    const result = await handleToolCall(adapter, 'screenshot', {}, overrides)
    expect(result.isError).not.toBe(true)
    expect(updates).toBe(0)
  })

  it('treats missing OS permission details as ungranted in the approval panel', async () => {
    const adapter = makeAdapter([{ bundleId: grant.bundleId, displayName: grant.displayName, path: '/fixture/editor' }])
    adapter.ensureOsPermissions = async () => ({ granted: false })
    let captured: CuPermissionRequest | undefined
    await handleToolCall(adapter, 'request_access', { apps: ['Editor'], reason: 'Inspect the visual layout' }, makeOverrides(async request => { captured = request; return { granted: [], denied: [], flags: DEFAULT_GRANT_FLAGS } }))
    expect(captured?.tccState).toEqual({ accessibility: false, screenRecording: false })
  })
})
