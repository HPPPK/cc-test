import { afterEach, expect, spyOn, test } from 'bun:test'
import { mkdtemp, mkdir, rm, writeFile, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as rg from './ripgrep.js'
import { glob } from './glob.js'
import { getEmptyToolPermissionContext } from '../Tool.js'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
test('Glob works without rg and retains hidden files, pagination, symlink and cancellation boundaries', async () => {
  const root = await mkdtemp(join(tmpdir(), 'glob-no-rg-')); roots.push(root)
  await mkdir(join(root, 'reports')); await mkdir(join(root, '.hidden'))
  await writeFile(join(root, 'reports/a.md'), 'a'); await writeFile(join(root, '.hidden/b.md'), 'b')
  const outside = await mkdtemp(join(tmpdir(), 'glob-outside-')); roots.push(outside)
  await writeFile(join(outside, 'secret.md'), 'outside'); await symlink(outside, join(root, 'linked')); await symlink(join(outside, 'secret.md'), join(root, 'file-link.md'))
  const stub = spyOn(rg, 'ripgrepCommand').mockReturnValue({ rgPath: '', rgArgs: [] })
  try {
    const result = await glob('**/*.md', root, { limit: 1, offset: 0 }, new AbortController().signal, getEmptyToolPermissionContext())
    expect(result.files).toHaveLength(1); expect(result.truncated).toBe(true)
    const full = await glob('**/*.md', root, { limit: 10, offset: 0 }, new AbortController().signal, getEmptyToolPermissionContext())
    expect(full.files.sort()).toEqual([join(root, '.hidden/b.md'), join(root, 'reports/a.md')].sort())
    await expect(glob('**/*', root, { limit: 10, offset: 0 }, AbortSignal.abort(), getEmptyToolPermissionContext())).rejects.toThrow()
  } finally { stub.mockRestore() }
})

test('fallback retains permission and plugin exclusions and refuses to silently ignore gitignore mode', async () => {
  const root = await mkdtemp(join(tmpdir(), 'glob-deny-')); roots.push(root)
  await mkdir(join(root, 'private')); await mkdir(join(root, 'old-plugin'))
  for (const file of ['ok.md', 'private/secret.md', 'old-plugin/readme.md', 'hidden.secret']) await writeFile(join(root, file), 'x')
  const filesystem = await import('./permissions/filesystem.js')
  const plugins = await import('./plugins/orphanedPluginFilter.js')
  const stub = spyOn(rg, 'ripgrepCommand').mockReturnValue({ rgPath: '', rgArgs: [] })
  const deny = spyOn(filesystem, 'getFileReadIgnorePatterns').mockReturnValue(new Map([[null, ['private/**', '*.secret']]]))
  const plugin = spyOn(plugins, 'getGlobExclusionsForPluginCache').mockResolvedValue(['!old-plugin/**'])
  const previous = process.env.CLAUDE_CODE_GLOB_NO_IGNORE
  try {
    expect((await glob('**/*', root, { limit: 10, offset: 0 }, new AbortController().signal, getEmptyToolPermissionContext())).files).toEqual([join(root, 'ok.md')])
    process.env.CLAUDE_CODE_GLOB_NO_IGNORE = 'false'
    await expect(glob('**/*', root, { limit: 10, offset: 0 }, new AbortController().signal, getEmptyToolPermissionContext())).rejects.toThrow('.gitignore')
  } finally {
    stub.mockRestore(); deny.mockRestore(); plugin.mockRestore()
    if (previous === undefined) delete process.env.CLAUDE_CODE_GLOB_NO_IGNORE
    else process.env.CLAUDE_CODE_GLOB_NO_IGNORE = previous
  }
})

test('available rg retains the normal search path and its real failures are not hidden by fallback', async () => {
  const root = await mkdtemp(join(tmpdir(), 'glob-with-rg-')); roots.push(root)
  const available = spyOn(rg, 'ripgrepCommand').mockReturnValue({ rgPath: '/fixture/rg', rgArgs: [] })
  const search = spyOn(rg, 'ripGrep').mockResolvedValue(['report.md'])
  try {
    expect((await glob('*.md', root, { limit: 10, offset: 0 }, new AbortController().signal, getEmptyToolPermissionContext())).files).toEqual([join(root, 'report.md')])
    search.mockRejectedValue(new Error('actual search permission failure'))
    await expect(glob('*.md', root, { limit: 10, offset: 0 }, new AbortController().signal, getEmptyToolPermissionContext())).rejects.toThrow('actual search permission failure')
  } finally { search.mockRestore(); available.mockRestore() }
})
