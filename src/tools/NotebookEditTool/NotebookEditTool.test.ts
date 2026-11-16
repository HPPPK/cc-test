import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NotebookEditTool } from './NotebookEditTool.js'
import { callToolFixture } from '../toolFixtures.test.js'

test('inserting a modern notebook cell persists a generated string cell ID', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'notebook-type-contract-'))
  const file = join(dir, 'fixture.ipynb')
  try {
    await writeFile(file, JSON.stringify({ nbformat: 4, nbformat_minor: 5, metadata: { language_info: { name: 'python' } }, cells: [] }))
    await callToolFixture(NotebookEditTool, { notebook_path: file, edit_mode: 'insert', cell_type: 'code', new_source: 'print(7)' })
    const saved: unknown = JSON.parse(await readFile(file, 'utf8'))
    expect(saved).toMatchObject({ cells: [{ id: expect.any(String), cell_type: 'code', source: 'print(7)' }] })
  } finally { await rm(dir, { recursive: true, force: true }) }
})
