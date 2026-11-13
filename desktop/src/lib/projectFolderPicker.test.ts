import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), open: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: mocks.open }))

import { pickProjectFolder } from './projectFolderPicker'

afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks() })

describe('project folder picker', () => {
  it('isolates macOS dialogs through the native command instead of the in-process dialog plugin', async () => {
    vi.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel')
    mocks.invoke.mockResolvedValue('/workspace/中文 project/')
    expect(await pickProjectFolder('Choose folder')).toBe('/workspace/中文 project/')
    expect(mocks.invoke).toHaveBeenCalledWith('pick_project_folder', { title: 'Choose folder' })
    expect(mocks.open).not.toHaveBeenCalled()
  })

  it('preserves cancellation and propagates helper failure for the browser fallback', async () => {
    vi.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel')
    mocks.invoke.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('helper exited 101'))
    expect(await pickProjectFolder('Choose')).toBeNull()
    await expect(pickProjectFolder('Choose')).rejects.toThrow('helper exited 101')
    expect(mocks.open).not.toHaveBeenCalled()
  })

  it('retains the existing native dialog on other desktop platforms', async () => {
    vi.spyOn(window.navigator, 'platform', 'get').mockReturnValue('Win32')
    mocks.open.mockResolvedValue('C:\\project')
    expect(await pickProjectFolder('Choose')).toBe('C:\\project')
    expect(mocks.open).toHaveBeenCalledWith({ directory: true, multiple: false, title: 'Choose' })
    expect(mocks.invoke).not.toHaveBeenCalled()
  })
})
