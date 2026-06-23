import { describe, expect, it } from 'bun:test'

import { DEFAULT_GRANT_FLAGS } from './types.js'
import { handleToolCall } from './toolCalls.js'
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
