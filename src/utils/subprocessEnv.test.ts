import { describe, expect, it } from 'bun:test'

import { withBundledNodeRuntimePath } from './subprocessEnv.js'

describe('withBundledNodeRuntimePath', () => {
  it('prepends the app-bundled Node directory without overwriting the user PATH', () => {
    const result = withBundledNodeRuntimePath({
      Path: 'C:\\Windows\\System32;C:\\Users\\example\\bin',
      CLAUDE_BUNDLED_NODE_EXECUTABLE: 'C:\\Program Files\\Claude Code Jiangxia\\binaries\\node-runtime\\node-v22.23.1-win-x64\\node.exe',
    }, 'win32')

    expect(result.Path).toBe(
      'C:\\Program Files\\Claude Code Jiangxia\\binaries\\node-runtime\\node-v22.23.1-win-x64;C:\\Windows\\System32;C:\\Users\\example\\bin',
    )
  })

  it('leaves the environment unchanged when no bundled Node runtime is available', () => {
    const env = { PATH: '/usr/bin' }

    expect(withBundledNodeRuntimePath(env, 'linux')).toBe(env)
  })
})
