import { describe, expect, test } from 'bun:test'
import { ZipPackAdapter } from './zipPackAdapter.js'

const textEncoder = new TextEncoder()

function bytes(value: string): Uint8Array {
  return textEncoder.encode(value)
}

describe('ZipPackAdapter', () => {
  test('writes and reads pack entries without executing contents', async () => {
    const adapter = new ZipPackAdapter()
    const archive = await adapter.write({
      'manifest.json': bytes(JSON.stringify({ packId: 'pack-a' })),
      'workflows/guided.workflow.json': bytes(JSON.stringify({ schemaVersion: 2, id: 'guided' })),
      'README.md': bytes('# Pack'),
    })

    const zip = await adapter.read(archive)

    expect(zip.entries.map((entry) => entry.path)).toEqual([
      'manifest.json',
      'workflows/guided.workflow.json',
      'README.md',
    ])
    expect(await zip.readText('manifest.json')).toContain('pack-a')
  })

  test('rejects path traversal entries', async () => {
    const adapter = new ZipPackAdapter()
    const archive = await adapter.write({
      'manifest.json': bytes('{}'),
      '../outside.json': bytes('{}'),
    }, { validatePaths: false })

    await expect(adapter.read(archive)).rejects.toThrow(/Unsafe ZIP entry path/i)
  })
})
