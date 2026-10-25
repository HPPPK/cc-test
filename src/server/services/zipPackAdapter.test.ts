import { describe, expect, test } from 'bun:test'
import { deflateRawSync } from 'node:zlib'
import { readFile, readdir } from 'node:fs/promises'
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

// Tiny deliberately crafted ZIPs let size declarations differ from actual payloads.
function craftedZip(entries: { path: string, text: string, method?: number, declaredSize?: number }[]): Uint8Array {
  const localParts: Buffer[] = []
  const centralParts: Buffer[] = []
  let offset = 0
  for (const entry of entries) {
    const name = Buffer.from(entry.path)
    const data = Buffer.from(entry.text)
    const method = entry.method ?? 8
    const compressed = method === 8 ? deflateRawSync(data) : data
    const local = Buffer.alloc(30 + name.length)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(method, 8)
    local.writeUInt32LE(compressed.length, 18)
    local.writeUInt32LE(entry.declaredSize ?? data.length, 22)
    local.writeUInt16LE(name.length, 26)
    name.copy(local, 30)
    const central = Buffer.alloc(46 + name.length)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(method, 10)
    central.writeUInt32LE(compressed.length, 20)
    central.writeUInt32LE(entry.declaredSize ?? data.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    name.copy(central, 46)
    localParts.push(local, compressed)
    centralParts.push(central)
    offset += local.length + compressed.length
  }
  const central = Buffer.concat(centralParts)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(central.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...localParts, central, end])
}

describe('ZipPackAdapter output limits', () => {
  test('stops deflation at the declared output bound for a forged small header', async () => {
    const zip = await new ZipPackAdapter().read(craftedZip([
      { path: 'bomb.txt', text: 'x'.repeat(128), declaredSize: 4 },
    ]), { maxFileBytes: 16 })
    await expect(zip.readBytes('bomb.txt')).rejects.toThrow(/maximum output size/i)
  })

  test.each([0, 8])('rejects actual output smaller than its declaration for method %s', async (method) => {
    const zip = await new ZipPackAdapter().read(craftedZip([
      { path: 'short.txt', text: 'a', declaredSize: 4, method },
    ]))
    await expect(zip.readBytes('short.txt')).rejects.toThrow(/size mismatch/i)
  })

  test('rejects stored output larger than its forged declaration', async () => {
    const zip = await new ZipPackAdapter().read(craftedZip([
      { path: 'stored.txt', text: 'x'.repeat(32), declaredSize: 4, method: 0 },
    ]), { maxFileBytes: 8 })
    await expect(zip.readBytes('stored.txt')).rejects.toThrow(/maximum output size/i)
  })

  test('rejects nonempty output hidden behind a zero-byte declaration', async () => {
    const zip = await new ZipPackAdapter().read(craftedZip([
      { path: 'empty.txt', text: 'x', declaredSize: 0 },
    ]), { maxFileBytes: 0, maxTotalUncompressedBytes: 0 })
    await expect(zip.readBytes('empty.txt')).rejects.toThrow(/maximum output size/i)
  })

  test('propagates corrupt deflate errors instead of returning partial data', async () => {
    const archive = Buffer.from(craftedZip([{ path: 'bad.txt', text: 'hello' }]))
    archive.fill(0xff, 30 + 'bad.txt'.length, 30 + 'bad.txt'.length + 7)
    const zip = await new ZipPackAdapter().read(archive)
    await expect(zip.readBytes('bad.txt')).rejects.toThrow()
  })

  test('rejects a total logical output budget overflow before reading files', async () => {
    await expect(new ZipPackAdapter().read(craftedZip([
      { path: 'a.txt', text: '1234' },
      { path: 'b.txt', text: '5678' },
    ]), { maxFileBytes: 4, maxTotalUncompressedBytes: 7 })).rejects.toThrow(/total uncompressed size/i)
  })

  test('allows exact output budgets and repeated reads without charging twice', async () => {
    const zip = await new ZipPackAdapter().read(craftedZip([
      { path: 'a.txt', text: '1234' },
      { path: 'b.txt', text: '5678', method: 0 },
      { path: 'empty.txt', text: '' },
    ]), { maxFileBytes: 4, maxTotalUncompressedBytes: 8, maxEntries: 3 })
    expect(await zip.readText('a.txt')).toBe('1234')
    expect(await zip.readText('a.txt')).toBe('1234')
    expect(await zip.readText('b.txt')).toBe('5678')
    expect(await zip.readText('empty.txt')).toBe('')
  })

  test('counts directory records toward the entry limit', async () => {
    await expect(new ZipPackAdapter().read(craftedZip([
      { path: 'dir/', text: '' },
      { path: 'a.txt', text: 'a' },
    ]), { maxEntries: 1 })).rejects.toThrow(/maximum entry count/i)
  })

  test('rejects duplicate paths instead of silently replacing the indexed entry', async () => {
    await expect(new ZipPackAdapter().read(craftedZip([
      { path: 'same.txt', text: 'one' },
      { path: 'same.txt', text: 'two' },
    ]))).rejects.toThrow(/duplicate ZIP entry path/i)
  })

  test.each(['maxArchiveBytes', 'maxFileBytes', 'maxTotalUncompressedBytes', 'maxEntries'] as const)(
    'rejects invalid %s limits instead of disabling the bound', async (key) => {
      const archive = craftedZip([{ path: 'a.txt', text: 'a' }])
      for (const invalid of [Infinity, NaN, -1, 1.5]) {
        await expect(new ZipPackAdapter().read(archive, { [key]: invalid })).rejects.toThrow(/invalid ZIP limit/i)
      }
    },
  )

  test('reads all shipped workflow and expert packs within the default budgets', async () => {
    const packDirectory = new URL('../packs/', import.meta.url)
    for (const directory of [packDirectory, new URL('experts/', packDirectory)]) {
      for (const name of await readdir(directory)) {
        if (!name.endsWith('.zip')) continue
        const zip = await new ZipPackAdapter().read(await readFile(new URL(name, directory)))
        expect(zip.entries.length).toBeGreaterThan(0)
        for (const entry of zip.entries) {
          expect((await zip.readBytes(entry.path)).byteLength).toBe(entry.uncompressedSize)
        }
      }
    }
  })
})
