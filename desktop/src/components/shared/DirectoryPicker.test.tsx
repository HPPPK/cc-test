import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'

const picker = vi.hoisted(() => ({ pick: vi.fn() }))
vi.mock('../../lib/projectFolderPicker', () => ({ pickProjectFolder: picker.pick }))
let testTime = Date.now()
beforeEach(() => {
  testTime += 31_000
  vi.spyOn(Date, 'now').mockReturnValue(testTime)
})
afterEach(() => {
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

vi.mock('../../api/sessions', () => ({
  sessionsApi: {
    getRecentProjects: vi.fn(),
  },
}))

vi.mock('../../api/filesystem', () => ({
  filesystemApi: {
    browse: vi.fn(),
  },
}))

import { DirectoryPicker } from './DirectoryPicker'
import { sessionsApi } from '../../api/sessions'
import { filesystemApi } from '../../api/filesystem'

describe('DirectoryPicker', () => {
  const openNative = async (onChange = vi.fn()) => {
    Object.assign(window, { __TAURI_INTERNALS__: {} })
    vi.mocked(sessionsApi.getRecentProjects).mockResolvedValue({ projects: [] })
    render(<DirectoryPicker value="/workspace/original" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /original/ }))
    fireEvent.click(await screen.findByText(/选择其他文件夹|Choose a different folder/))
    return onChange
  }

  it('falls back to app browsing after a native failure without changing the current folder', async () => {
    picker.pick.mockRejectedValue(new Error('native helper exited 101'))
    vi.mocked(filesystemApi.browse).mockResolvedValue({
      currentPath: '/workspace/original', parentPath: '/workspace',
      entries: [{ name: 'child', path: '/workspace/original/child', isDirectory: true }],
    })
    const onChange = await openNative()
    expect(await screen.findByRole('alert')).toHaveTextContent(/窗口|window/)
    expect(await screen.findByRole('button', { name: /child/ })).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /使用此文件夹|Use this folder/ }))
    expect(onChange).toHaveBeenCalledWith('/workspace/original')
  })

  it('treats native cancellation as cancellation without opening the fallback', async () => {
    picker.pick.mockResolvedValue(null)
    const onChange = await openNative()
    await waitFor(() => expect(picker.pick).toHaveBeenCalled())
    expect(onChange).not.toHaveBeenCalled()
    expect(filesystemApi.browse).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('uses the selected native folder', async () => {
    picker.pick.mockResolvedValue('/workspace/中文 project')
    const onChange = await openNative()
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('/workspace/中文 project'))
  })

  it('ignores a late native selection after the user switches to the in-app browser', async () => {
    let resolveNative!: (path: string) => void
    picker.pick.mockImplementationOnce(() => new Promise((resolve) => { resolveNative = resolve }))
    vi.mocked(filesystemApi.browse).mockResolvedValue({ currentPath: '/workspace/original', parentPath: '/workspace', entries: [] })
    const onChange = await openNative()
    fireEvent.click(screen.getByRole('button', { name: /original/ }))
    fireEvent.click(await screen.findByText(/在应用内选择|Browse in app/))
    const useFolder = await screen.findByRole('button', { name: /使用此文件夹|Use this folder/ })
    await waitFor(() => expect(useFolder).not.toBeDisabled())
    fireEvent.click(useFolder)
    await act(async () => resolveNative('/workspace/stale-native'))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenLastCalledWith('/workspace/original')
  })

  it('allows desktop users to bypass native dialogs and blocks selection after browse errors', async () => {
    Object.assign(window, { __TAURI_INTERNALS__: {} })
    vi.mocked(sessionsApi.getRecentProjects).mockResolvedValue({ projects: [] })
    vi.mocked(filesystemApi.browse).mockRejectedValueOnce(new Error('offline')).mockResolvedValue({
      currentPath: '/workspace', parentPath: '/', entries: [],
    })
    render(<DirectoryPicker value="/workspace" onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'folder workspace expand_more' }))
    fireEvent.click(await screen.findByText(/在应用内选择|Browse in app/))
    expect(await screen.findByRole('alert')).toHaveTextContent(/读取|load/)
    expect(screen.getByRole('button', { name: /使用此文件夹|Use this folder/ })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /重试|Retry/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: /使用此文件夹|Use this folder/ })).not.toBeDisabled())
    expect(picker.pick).not.toHaveBeenCalled()
  })

  it('retries the failed destination rather than silently returning to its parent', async () => {
    vi.mocked(filesystemApi.browse)
      .mockResolvedValueOnce({ currentPath: '/workspace', parentPath: '/', entries: [{ name: 'child', path: '/workspace/child', isDirectory: true }] })
      .mockRejectedValueOnce(new Error('temporarily unavailable'))
      .mockResolvedValueOnce({ currentPath: '/workspace/child', parentPath: '/workspace', entries: [] })
    vi.mocked(sessionsApi.getRecentProjects).mockResolvedValue({ projects: [] })
    render(<DirectoryPicker value="/workspace" onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    fireEvent.click(await screen.findByText(/选择其他文件夹|Choose a different folder/))
    fireEvent.click(await screen.findByRole('button', { name: /folder child/ }))
    fireEvent.click(await screen.findByRole('button', { name: /重试|Retry/ }))
    await waitFor(() => expect(filesystemApi.browse).toHaveBeenLastCalledWith('/workspace/child'))
  })

  it('does not let a late parent response replace the newer folder', async () => {
    let resolveParent!: (value: { currentPath: string; parentPath: string; entries: [] }) => void
    vi.mocked(filesystemApi.browse)
      .mockResolvedValueOnce({ currentPath: '/workspace', parentPath: '/', entries: [{ name: 'child', path: '/workspace/child', isDirectory: true }] })
      .mockImplementationOnce(() => new Promise((resolve) => { resolveParent = resolve }))
      .mockResolvedValueOnce({ currentPath: '/workspace', parentPath: '/', entries: [] })
    vi.mocked(sessionsApi.getRecentProjects).mockResolvedValue({ projects: [] })
    const onChange = vi.fn()
    render(<DirectoryPicker value="/workspace" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button'))
    fireEvent.click(await screen.findByText(/选择其他文件夹|Choose a different folder/))
    await screen.findByRole('button', { name: /folder child/ })
    fireEvent.click(screen.getByRole('button', { name: '/' }))
    fireEvent.click(screen.getByRole('button', { name: 'workspace' }))
    await act(async () => resolveParent({ currentPath: '/', parentPath: '', entries: [] }))
    fireEvent.click(screen.getByRole('button', { name: /使用此文件夹|Use this folder/ }))
    expect(onChange).toHaveBeenCalledWith('/workspace')
  })

  it('uses the source repository name as the fallback label for desktop worktree paths', () => {
    render(
      <DirectoryPicker
        value="/workspace/checkout/.claude/worktrees/desktop-feature-rail-12345678"
        onChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('button')).toHaveTextContent('checkout')
    expect(screen.getByRole('button')).not.toHaveTextContent('desktop-feature-rail-12345678')
  })

  it('does not duplicate the branch in the selected project chip', async () => {
    vi.mocked(sessionsApi.getRecentProjects).mockResolvedValue({
      projects: [{
        projectPath: '/workspace/project',
        realPath: '/workspace/project',
        projectName: 'project',
        repoName: 'NanmiCoder/OpenCutSkill',
        branch: 'main',
        isGit: true,
        modifiedAt: '2026-05-07T00:00:00.000Z',
        sessionCount: 1,
      }],
    })

    render(
      <DirectoryPicker
        value="/workspace/project"
        onChange={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button'))

    const trigger = await waitFor(() => screen.getAllByRole('button', { name: /NanmiCoder\/OpenCutSkill/ })[0])
    expect(trigger).toHaveTextContent('NanmiCoder/OpenCutSkill')
    expect(trigger).not.toHaveTextContent('main')
  })

  it('supports the flat workbar trigger variant without changing the selected label', () => {
    render(
      <DirectoryPicker
        value="/workspace/project"
        onChange={vi.fn()}
        variant="workbar"
      />,
    )

    const trigger = screen.getByRole('button')
    expect(trigger).toHaveTextContent('project')
    expect(trigger.className).toContain('rounded-[7px]')
    expect(trigger.className).not.toContain('rounded-full')
  })

  it('constrains long workbar project names without hiding the full path from hover users', () => {
    const longProjectName = 'project-with-a-very-long-directory-name-that-should-not-stretch-the-launch-bar'
    const longPath = `/workspace/${longProjectName}`

    render(
      <DirectoryPicker
        value={longPath}
        onChange={vi.fn()}
        variant="workbar"
      />,
    )

    const trigger = screen.getByRole('button')
    const label = screen.getByText(longProjectName)
    const triggerClasses = trigger.className.split(/\s+/)
    expect(trigger).toHaveAttribute('title', longPath)
    expect(triggerClasses).toContain('max-w-full')
    expect(triggerClasses).not.toContain('w-full')
    expect(trigger.parentElement?.className).toContain('max-w-[320px]')
    expect(label.className).toContain('truncate')
  })

  it('can show a Git icon for workbar projects before the recent-project cache is loaded', () => {
    render(
      <DirectoryPicker
        value="/workspace/project"
        onChange={vi.fn()}
        variant="workbar"
        isGitProject
      />,
    )

    expect(screen.getByRole('button').querySelector('svg')).toBeInTheDocument()
  })

  it('renders browse entries without nesting interactive buttons', async () => {
    vi.mocked(sessionsApi.getRecentProjects).mockResolvedValue({ projects: [] })
    vi.mocked(filesystemApi.browse).mockResolvedValue({
      currentPath: '/workspace',
      parentPath: '/Users/nanmi',
      entries: [{ name: 'project', path: '/workspace/project', isDirectory: true }],
    })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(<DirectoryPicker value="" onChange={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /选择项目|Select a project/ }))
    fireEvent.click(await screen.findByText(/选择其他文件夹|Choose a different folder/))

    expect(await screen.findByRole('button', { name: /project/ })).toBeInTheDocument()
    expect(errorSpy).not.toHaveBeenCalledWith(expect.stringContaining('validateDOMNesting'))

    errorSpy.mockRestore()
  })
})
