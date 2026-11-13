import { describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

async function fixture(source: string, files: Record<string, string> = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'missing-imports-'))
  await mkdir(path.join(root, 'src'), { recursive: true })
  await writeFile(path.join(root, 'src/main.ts'), source)
  for (const [file, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true })
    await writeFile(path.join(root, file), content)
  }
  return root
}

async function scanner() {
  // Never import the old script: its top-level main mutates the real checkout.
  expect(await readFile(path.join(__dirname, 'scan-missing-imports.ts'), 'utf8')).toContain('export async function scanMissingImports')
  return import('./scan-missing-imports')
}

describe('missing import boundary', () => {
  it('reports required runtime and type contracts without creating files', async () => {
    const scan = await scanner()
    const root = await fixture("import type { Task } from './types/task.js'\nconst x = require('./required.js')")
    try {
      const report = await scan.scanMissingImports(root)
      expect(report.missing.map(x => [x.target, x.kind])).toEqual([
        ['src/required.ts', 'runtime'], ['src/types/task.ts', 'type'],
      ])
      expect(existsSync(path.join(root, 'src/required.ts'))).toBe(false)
    } finally { await rm(root, { recursive: true, force: true }) }
  })

  it('ignores comments and strings, resolves ESM TSX and directories as files only', async () => {
    const scan = await scanner()
    const root = await fixture(`// import X from './comment'
const example = "require('./string')"
import X from './view.js'
import Y from './folder'
import './empty'`, { 'src/view.tsx': 'export default 1', 'src/folder/index.ts': 'export default 1' })
    await mkdir(path.join(root, 'src/empty'))
    try {
      expect((await scan.scanMissingImports(root)).missing.map(x => x.target)).toEqual(['src/empty.ts'])
    } finally { await rm(root, { recursive: true, force: true }) }
  })

  it('reports existing generated stubs as unaudited and never rewrites them', async () => {
    const scan = await scanner()
    const content = '// @generated stub from scan-missing-imports\nexport default 1\n'
    const root = await fixture("import './legacy'", { 'src/legacy.ts': content })
    try {
      const report = await scan.scanMissingImports(root)
      expect(report.unauditedStubs).toEqual(['src/legacy.ts'])
      expect(await readFile(path.join(root, 'src/legacy.ts'), 'utf8')).toBe(content)
    } finally { await rm(root, { recursive: true, force: true }) }
  })

  it('check and dry-run fail for missing guarded or escaping imports without writes', async () => {
    await scanner()
    const root = await fixture("if (feature('INTERNAL')) require('./optional')\nimport '../escape'")
    try {
      for (const flag of ['--check', '--dry-run']) {
        const result = spawnSync('bun', [path.join(__dirname, 'scan-missing-imports.ts'), flag, '--root', root])
        expect(result.status).toBe(1)
        expect(result.stdout?.toString()).toContain('src/optional.ts')
        expect(existsSync(path.join(root, 'src/optional.ts'))).toBe(false)
        expect(existsSync(path.join(root, 'escape.ts'))).toBe(false)
      }
    } finally { await rm(root, { recursive: true, force: true }) }
  })
})
