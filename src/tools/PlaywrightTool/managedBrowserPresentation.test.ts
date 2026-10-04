import { describe, expect, mock, test } from 'bun:test'
import type { Browser } from 'playwright'
import { presentManagedBrowserWindow } from './managedBrowserPresentation.js'

function fixture() {
  const send = mock(async (_method: string) => ({ processInfo: [{ type: 'renderer', id: 11 }, { type: 'browser', id: 42 }] }))
  const detach = mock(async () => {})
  const newBrowserCDPSession = mock(async () => ({ send, detach }))
  const browser = { isConnected: () => true, newBrowserCDPSession } as unknown as Browser
  const restorePage = mock(async () => true)
  const restoreNative = mock(async (_pid: number | undefined, _bounds: unknown) => true)
  return {
    send, detach, newBrowserCDPSession, restorePage, restoreNative,
    input: { browser, connectionKind: 'managed' as 'managed' | 'cdp', headed: true,
      bounds: { left: 72, top: 72, width: 1280, height: 800 }, restorePage },
    deps: { platform: 'win32' as NodeJS.Platform, restoreNative },
  }
}

describe('explicit managed browser presentation', () => {
  test('restores the exact browser OS process even when CDP already reports normal', async () => {
    const f = fixture()
    expect(await presentManagedBrowserWindow(f.input, f.deps)).toBe(true)
    expect(f.restorePage).toHaveBeenCalledTimes(1)
    expect(f.send).toHaveBeenCalledWith('SystemInfo.getProcessInfo')
    expect(f.restoreNative).toHaveBeenCalledWith(42, f.input.bounds)
    expect(f.detach).toHaveBeenCalledTimes(1)
  })

  test('does not report CDP tab activation as a successful Windows foreground restore', async () => {
    const f = fixture()
    f.restoreNative.mockResolvedValue(false)
    expect(await presentManagedBrowserWindow(f.input, f.deps)).toBe(false)
  })

  test('still tries native recovery after a failed or throwing CDP window restore', async () => {
    for (const throws of [false, true]) {
      const f = fixture()
      if (throws) f.restorePage.mockRejectedValue(new Error('CDP window closed'))
      else f.restorePage.mockResolvedValue(false)
      expect(await presentManagedBrowserWindow(f.input, f.deps)).toBe(true)
      expect(f.restoreNative).toHaveBeenCalledTimes(1)
    }
  })

  test('never controls user CDP browsers, headless sessions or a disconnected browser', async () => {
    for (const change of ['cdp', 'headless', 'disconnected']) {
      const f = fixture()
      if (change === 'cdp') f.input.connectionKind = 'cdp'
      if (change === 'headless') f.input.headed = false
      if (change === 'disconnected') f.input.browser.isConnected = () => false
      expect(await presentManagedBrowserWindow(f.input, f.deps)).toBe(false)
      expect(f.restorePage).not.toHaveBeenCalled()
      expect(f.newBrowserCDPSession).not.toHaveBeenCalled()
      expect(f.restoreNative).not.toHaveBeenCalled()
    }
  })

  test('never guesses a PID from missing, ambiguous or invalid browser process records', async () => {
    for (const processInfo of [[], [{ type: 'renderer', id: 11 }], [{ type: 'browser', id: 0 }], [{ type: 'browser', id: 42 }, { type: 'browser', id: 43 }]]) {
      const f = fixture()
      f.send.mockResolvedValue({ processInfo })
      expect(await presentManagedBrowserWindow(f.input, f.deps)).toBe(false)
      expect(f.restoreNative).not.toHaveBeenCalled()
      expect(f.detach).toHaveBeenCalledTimes(1)
    }
  })

  test('does not cache a PID across browser reconnects and always detaches on errors', async () => {
    const f = fixture()
    expect(await presentManagedBrowserWindow(f.input, f.deps)).toBe(true)
    f.send.mockResolvedValue({ processInfo: [{ type: 'browser', id: 43 }] })
    expect(await presentManagedBrowserWindow(f.input, f.deps)).toBe(true)
    expect(f.restoreNative.mock.calls.map(call => call[0])).toEqual([42, 43])
    f.send.mockRejectedValue(new Error('Browser closed'))
    expect(await presentManagedBrowserWindow(f.input, f.deps)).toBe(false)
    expect(f.detach).toHaveBeenCalledTimes(3)
    expect(f.restoreNative).toHaveBeenCalledTimes(2)
  })

  test('handles unavailable browser sessions and native helper failures without throwing', async () => {
    const f = fixture()
    f.newBrowserCDPSession.mockRejectedValue(new Error('disconnected'))
    expect(await presentManagedBrowserWindow(f.input, f.deps)).toBe(false)
    expect(f.restoreNative).not.toHaveBeenCalled()
    const g = fixture()
    g.restoreNative.mockRejectedValue(new Error('native failure'))
    expect(await presentManagedBrowserWindow(g.input, g.deps)).toBe(false)
  })

  test('keeps non-Windows presentation on the existing CDP path only', async () => {
    const f = fixture()
    f.deps.platform = 'linux'
    expect(await presentManagedBrowserWindow(f.input, f.deps)).toBe(true)
    f.restorePage.mockResolvedValue(false)
    expect(await presentManagedBrowserWindow(f.input, f.deps)).toBe(false)
    expect(f.newBrowserCDPSession).not.toHaveBeenCalled()
    expect(f.restoreNative).not.toHaveBeenCalled()
  })
})
