import { afterEach, describe, expect, it, mock } from 'bun:test'
import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

const cleanupDirs = new Set<string>()

mock.module('../../utils/config.js', () => ({
  getGlobalConfig: () => {
    throw new Error('unexpected global config failure')
  },
}))

mock.module('../../utils/settings/settings.js', () => ({
  getInitialSettings: () => ({}),
}))

mock.module('../../utils/ripgrep.js', () => ({
  ripGrep: async () => ['cache-result.ts'],
}))

const { handleFilesystemRoute } = await import('../api/filesystem.js')

afterEach(async () => {
  for (const directory of cleanupDirs) {
    await fsp.rm(directory, { recursive: true, force: true })
  }
  cleanupDirs.clear()
})

function makeUrl(route: string, params: Record<string, string>): URL {
  const url = new URL(`http://localhost${route}`)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  return url
}

describe('filesystem configuration fallback', () => {
  it('keeps unexpected global configuration failures visible', async () => {
    const directory = await fsp.mkdtemp(path.join(os.homedir(), 'claude-filesystem-config-failure-'))
    cleanupDirs.add(directory)
    await fsp.writeFile(path.join(directory, 'cache-result.ts'), 'export {}')

    const response = await handleFilesystemRoute(
      '/api/filesystem/browse',
      makeUrl('/api/filesystem/browse', {
        path: directory,
        search: 'cache',
        includeFiles: 'true',
      }),
    )

    expect(response.status).toBe(500)
    expect(await response.text()).toContain('unexpected global config failure')
  })
})
