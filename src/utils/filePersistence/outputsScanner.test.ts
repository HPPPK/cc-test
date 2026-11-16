import { expect, test } from 'bun:test'
import { mkdtemp, mkdir, writeFile, symlink, utimes, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findModifiedFiles } from './outputsScanner.js'

test('recursive output collection excludes old files and symlinks outside the output directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'output-scan-contract-'))
  try {
    await mkdir(join(root, 'outputs', 'nested'), { recursive: true })
    const fresh = join(root, 'outputs', 'nested', 'report.html')
    const stale = join(root, 'outputs', 'old.txt')
    await writeFile(fresh, 'new report')
    await writeFile(stale, 'old')
    await utimes(stale, new Date(0), new Date(0))
    await writeFile(join(root, 'private.txt'), 'not an output')
    await symlink(join(root, 'private.txt'), join(root, 'outputs', 'shortcut.txt'))
    expect(await findModifiedFiles(Date.now() - 10000, join(root, 'outputs'))).toEqual([fresh])
    expect(await findModifiedFiles(0, join(root, 'missing'))).toEqual([])
  } finally { await rm(root, { recursive: true, force: true }) }
})
