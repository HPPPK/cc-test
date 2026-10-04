import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export type ManagedBrowserWindowBounds = {
  left: number
  top: number
  width: number
  height: number
}

export type ManagedBrowserNativeWindowRestoreInvocation = {
  executable: string
  args: string[]
  script: string
}

export type ManagedBrowserProcessDiscoveryInvocation = {
  executable: string
  args: string[]
  script: string
}

function validBounds(bounds: ManagedBrowserWindowBounds): boolean {
  return Number.isFinite(bounds.left)
    && Number.isFinite(bounds.top)
    && Number.isFinite(bounds.width)
    && Number.isFinite(bounds.height)
    && bounds.width >= 320
    && bounds.height >= 240
}

function powerShellSingleQuoted(value: string): string {
  return "'" + value.replaceAll("'", "''") + "'"
}

/**
 * Creates a Windows-only discovery command which looks only at direct children
 * of this runner and only at the exact executable path it requested. This is
 * intentionally narrower than enumerating Chrome/Edge processes by name.
 */
export function buildManagedBrowserProcessDiscoveryInvocation(
  executablePath: string,
  parentProcessId = process.pid,
  systemRoot = process.env.SystemRoot ?? 'C:\\Windows',
): ManagedBrowserProcessDiscoveryInvocation {
  const expectedExecutablePath = executablePath.trim()
  if (!expectedExecutablePath) throw new Error('The managed Chromium executable path is required for process discovery.')
  if (!Number.isInteger(parentProcessId) || parentProcessId <= 0) {
    throw new Error('A positive runner process id is required for managed Chromium process discovery.')
  }

  const script = [
    "$ErrorActionPreference = 'Stop'",
    '$targetParentProcessId = ' + parentProcessId,
    '$expectedExecutablePath = ' + powerShellSingleQuoted(expectedExecutablePath),
    '$matches = @(',
    '  Get-CimInstance Win32_Process -Filter ("ParentProcessId = " + $targetParentProcessId) |',
    '    Where-Object { $_.ExecutablePath -and [string]::Equals([string]$_.ExecutablePath, $expectedExecutablePath, [System.StringComparison]::OrdinalIgnoreCase) } |',
    '    Select-Object -ExpandProperty ProcessId',
    ')',
    '[pscustomobject]@{ processIds = @($matches | ForEach-Object { [int]$_ }) } | ConvertTo-Json -Compress',
  ].join('\n')

  return {
    executable: join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
    script,
  }
}

export function parseManagedBrowserProcessDiscoveryResult(stdout: string): number[] {
  try {
    const parsed = JSON.parse(stdout.trim()) as { processIds?: unknown }
    if (!Array.isArray(parsed.processIds)) return []
    return [...new Set(parsed.processIds.filter((value): value is number => Number.isInteger(value) && value > 0))]
  } catch {
    return []
  }
}

/**
 * Returns exact main-process candidates which are direct children of this
 * runner and use the managed Chromium executable it launched. It never looks
 * up arbitrary user Chrome/Edge instances.
 */
export async function listManagedBrowserChildProcessIds(
  executablePath: string | undefined,
  parentProcessId = process.pid,
): Promise<number[]> {
  if (process.platform !== 'win32' || !executablePath?.trim()) return []
  try {
    const invocation = buildManagedBrowserProcessDiscoveryInvocation(executablePath, parentProcessId)
    const { stdout } = await execFileAsync(invocation.executable, invocation.args, {
      windowsHide: true,
      timeout: 3_000,
      maxBuffer: 16 * 1024,
    })
    return parseManagedBrowserProcessDiscoveryResult(stdout)
  } catch {
    return []
  }
}

/**
 * Captures one newly launched managed Chromium main process. Ambiguity is
 * deliberately treated as unavailable instead of guessing at a browser PID.
 */
export async function findNewManagedBrowserProcessId(
  executablePath: string | undefined,
  childProcessIdsBeforeLaunch: readonly number[],
  parentProcessId = process.pid,
): Promise<number | undefined> {
  const before = new Set(childProcessIdsBeforeLaunch)
  const candidates = (await listManagedBrowserChildProcessIds(executablePath, parentProcessId))
    .filter((processId) => !before.has(processId))
  return candidates.length === 1 ? candidates[0] : undefined
}

/**
 * Creates a Windows-only recovery command for a PID which the runner created
 * itself. It deliberately never enumerates arbitrary Chrome/Edge processes:
 * the native code accepts only the exact managed Chromium PID recorded by
 * this runner through its own browser debugging connection or launch boundary.
 */
export function buildManagedBrowserNativeWindowRestoreInvocation(
  managedBrowserProcessId: number,
  bounds: ManagedBrowserWindowBounds,
  systemRoot = process.env.SystemRoot ?? 'C:\\Windows',
): ManagedBrowserNativeWindowRestoreInvocation {
  if (!Number.isInteger(managedBrowserProcessId) || managedBrowserProcessId <= 0) {
    throw new Error('A positive managed Chromium process id is required for native window recovery.')
  }
  if (!validBounds(bounds)) throw new Error('Managed Chromium restore bounds must be usable on screen.')

  const script = [
    "$ErrorActionPreference = 'Stop'",
    '$targetProcessId = ' + managedBrowserProcessId,
    '$restoreLeft = ' + Math.round(bounds.left),
    '$restoreTop = ' + Math.round(bounds.top),
    '$restoreWidth = ' + Math.round(bounds.width),
    '$restoreHeight = ' + Math.round(bounds.height),
    '',
    "Add-Type @'",
    'using System;',
    'using System.Runtime.InteropServices;',
    'public static class CcJiangxiaManagedBrowserWindowRecovery {',
    '  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);',
    '  public static uint TargetProcessId;',
    '  public static IntPtr BestWindow = IntPtr.Zero;',
    '  public static long BestArea = -1;',
    '  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);',
    '  [DllImport("user32.dll", SetLastError=true)] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);',
    '  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);',
    '  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);',
    '  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);',
    '  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int command);',
    '  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr insertAfter, int x, int y, int cx, int cy, uint flags);',
    '  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);',
    '  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);',
    '  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();',
    '  [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr hWnd, uint flags);',
    '  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);',
    '  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }',
    '  private static bool CaptureWindow(IntPtr hWnd, IntPtr lParam) {',
    '    uint processId; GetWindowThreadProcessId(hWnd, out processId);',
    '    if (processId != TargetProcessId || !IsWindowVisible(hWnd) || GetWindowTextLength(hWnd) <= 0) return true;',
    '    RECT rect; if (!GetWindowRect(hWnd, out rect)) return true;',
    '    long area = Math.Max(0, rect.Right - rect.Left) * Math.Max(0, rect.Bottom - rect.Top);',
    '    if (area > BestArea) { BestArea = area; BestWindow = hWnd; }',
    '    return true;',
    '  }',
    '  public static void FindBestWindow() { BestWindow = IntPtr.Zero; BestArea = -1; EnumWindows(CaptureWindow, IntPtr.Zero); }',
    '}',
    "'@",
    '',
    '[CcJiangxiaManagedBrowserWindowRecovery]::TargetProcessId = [uint32]$targetProcessId',
    '[CcJiangxiaManagedBrowserWindowRecovery]::FindBestWindow()',
    '$bestWindow = [CcJiangxiaManagedBrowserWindowRecovery]::BestWindow',
    'if ($bestWindow -eq [IntPtr]::Zero) {',
    '  [pscustomobject]@{ restored = $false; visible = $false; minimized = $true; reason = \"managed_window_not_found\" } | ConvertTo-Json -Compress',
    '  exit 0',
    '}',
    '[void][CcJiangxiaManagedBrowserWindowRecovery]::ShowWindow($bestWindow, 9)',
    '[void][CcJiangxiaManagedBrowserWindowRecovery]::SetWindowPos($bestWindow, [IntPtr]::Zero, $restoreLeft, $restoreTop, $restoreWidth, $restoreHeight, 0x0040)',
    '[void][CcJiangxiaManagedBrowserWindowRecovery]::BringWindowToTop($bestWindow)',
    '[void][CcJiangxiaManagedBrowserWindowRecovery]::SetForegroundWindow($bestWindow)',
    'Start-Sleep -Milliseconds 120',
    '$restoredRect = [CcJiangxiaManagedBrowserWindowRecovery+RECT]::new()',
    '[void][CcJiangxiaManagedBrowserWindowRecovery]::GetWindowRect($bestWindow, [ref]$restoredRect)',
    '$visible = [CcJiangxiaManagedBrowserWindowRecovery]::IsWindowVisible($bestWindow)',
    '$minimized = [CcJiangxiaManagedBrowserWindowRecovery]::IsIconic($bestWindow)',
    '$onScreen = [CcJiangxiaManagedBrowserWindowRecovery]::MonitorFromWindow($bestWindow, 0) -ne [IntPtr]::Zero -and ($restoredRect.Right - $restoredRect.Left) -ge 320 -and ($restoredRect.Bottom - $restoredRect.Top) -ge 240',
    '$foreground = [CcJiangxiaManagedBrowserWindowRecovery]::GetForegroundWindow() -eq $bestWindow',
    '[pscustomobject]@{ restored = [bool]($visible -and -not $minimized -and $onScreen -and $foreground); foreground = [bool]$foreground; visible = [bool]$visible; minimized = [bool]$minimized; left = $restoredRect.Left; top = $restoredRect.Top; width = $restoredRect.Right - $restoredRect.Left; height = $restoredRect.Bottom - $restoredRect.Top } | ConvertTo-Json -Compress',
  ].join('\n')

  const encodedScript = Buffer.from(script, 'utf16le').toString('base64')
  return {
    executable: join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodedScript],
    script,
  }
}

export function parseManagedBrowserNativeWindowRestoreResult(stdout: string): boolean {
  try {
    const parsed = JSON.parse(stdout.trim()) as { restored?: unknown; visible?: unknown; minimized?: unknown; foreground?: unknown }
    return parsed.restored === true && parsed.visible === true && parsed.minimized === false && parsed.foreground === true
  } catch {
    return false
  }
}

/**
 * Explicit user-requested display recovery for the managed Chromium instance only. This
 * does not recreate a page, BrowserContext, or user-owned Chrome/Edge window.
 */
export async function restoreManagedBrowserWindowNatively(
  managedBrowserProcessId: number | undefined,
  bounds: ManagedBrowserWindowBounds,
): Promise<boolean> {
  if (process.platform !== 'win32' || !managedBrowserProcessId) return false
  const invocation = buildManagedBrowserNativeWindowRestoreInvocation(managedBrowserProcessId, bounds)
  try {
    const { stdout } = await execFileAsync(invocation.executable, invocation.args, {
      windowsHide: true,
      timeout: 5_000,
      maxBuffer: 32 * 1024,
    })
    return parseManagedBrowserNativeWindowRestoreResult(stdout)
  } catch {
    return false
  }
}
