import { describe, expect, test } from 'bun:test'
import { buildManagedBrowserNativeWindowRestoreInvocation, buildManagedBrowserProcessDiscoveryInvocation, parseManagedBrowserNativeWindowRestoreResult, parseManagedBrowserProcessDiscoveryResult } from './managedBrowserNativeWindow.js'

describe('managed browser native window recovery', () => {
  test('targets only the supplied managed Chromium process and restores it to usable bounds', () => {
    const invocation = buildManagedBrowserNativeWindowRestoreInvocation(55948, { left: 72, top: 72, width: 1280, height: 800 })

    expect(invocation.executable).toMatch(/powershell(?:\.exe)?$/i)
    expect(invocation.args).toContain('-EncodedCommand')
    expect(invocation.script).toContain('$targetProcessId = 55948')
    expect(invocation.script).toContain('ShowWindow')
    expect(invocation.script).toContain('SetWindowPos')
    expect(invocation.script).toContain('GetWindowThreadProcessId')
    expect(invocation.script).not.toContain('Get-Process chrome')
  })

  test('discovers only direct children of the runner using the exact managed Chromium executable', () => {
    const invocation = buildManagedBrowserProcessDiscoveryInvocation('C:\\managed\\chrome.exe', 4242)

    expect(invocation.executable).toMatch(/powershell(?:\.exe)?$/i)
    expect(invocation.script).toContain('$targetParentProcessId = 4242')
    expect(invocation.script).toContain("$expectedExecutablePath = 'C:\\managed\\chrome.exe'")
    expect(invocation.script).toContain('Get-CimInstance Win32_Process -Filter')
    expect(invocation.script).toContain('ParentProcessId')
    expect(invocation.script).toContain('ExecutablePath')
    expect(invocation.script).not.toContain('Get-Process chrome')
    expect(parseManagedBrowserProcessDiscoveryResult('{"processIds":[101,202,202,0,"bad"]}')).toEqual([101, 202])
    expect(parseManagedBrowserProcessDiscoveryResult('not json')).toEqual([])
  })

  test('accepts only an explicitly confirmed visible, foreground and non-minimized restore result', () => {
    expect(parseManagedBrowserNativeWindowRestoreResult('{"restored":true,"visible":true,"minimized":false,"foreground":true}')).toBe(true)
    expect(parseManagedBrowserNativeWindowRestoreResult('{"restored":true,"visible":true,"minimized":true}')).toBe(false)
    expect(parseManagedBrowserNativeWindowRestoreResult('{"restored":true,"visible":true,"minimized":false,"foreground":false}')).toBe(false)
    expect(parseManagedBrowserNativeWindowRestoreResult('{"restored":true,"visible":true,"minimized":false}')).toBe(false)
    expect(parseManagedBrowserNativeWindowRestoreResult('not json')).toBe(false)
  })
})
