import { inflateRawSync } from 'node:zlib'

export type ZipPackEntry = {
  path: string
  compressedSize: number
  uncompressedSize: number
  compressionMethod: number
}

export type ZipPackReadOptions = {
  maxArchiveBytes?: number
  maxFileBytes?: number
}

export type ZipPackWriteOptions = {
  validatePaths?: boolean
}

export type ZipPackArchive = {
  entries: ZipPackEntry[]
  has(path: string): boolean
  readBytes(path: string): Promise<Uint8Array>
  readText(path: string): Promise<string>
  readJson<T = unknown>(path: string): Promise<T>
}

type InternalZipEntry = ZipPackEntry & {
  dataOffset: number
  source: Buffer
}

const ZIP_MAX_ARCHIVE_BYTES = 25 * 1024 * 1024
const ZIP_MAX_FILE_BYTES = 5 * 1024 * 1024
const EOCD_SIGNATURE = 0x06054b50
const CENTRAL_FILE_SIGNATURE = 0x02014b50
const LOCAL_FILE_SIGNATURE = 0x04034b50

const textDecoder = new TextDecoder()
let crcTable: number[] | null = null

export class ZipPackAdapter {
  async read(input: Uint8Array, options: ZipPackReadOptions = {}): Promise<ZipPackArchive> {
    const maxArchiveBytes = options.maxArchiveBytes ?? ZIP_MAX_ARCHIVE_BYTES
    const maxFileBytes = options.maxFileBytes ?? ZIP_MAX_FILE_BYTES
    const buffer = Buffer.from(input)
    if (buffer.byteLength > maxArchiveBytes) {
      throw new Error(`ZIP archive exceeds maximum size of ${maxArchiveBytes} bytes.`)
    }

    const entries = parseCentralDirectory(buffer, maxFileBytes)
    for (const entry of entries) {
      assertSafeZipPath(entry.path)
    }
    const byPath = new Map(entries.map((entry) => [entry.path, entry]))

    return {
      entries: entries.map(publicEntry),
      has(pathName: string) {
        return byPath.has(pathName)
      },
      async readBytes(pathName: string): Promise<Uint8Array> {
        const entry = byPath.get(pathName)
        if (!entry) throw new Error(`ZIP entry not found: ${pathName}`)
        return readEntryBytes(entry)
      },
      async readText(pathName: string): Promise<string> {
        return textDecoder.decode(await this.readBytes(pathName))
      },
      async readJson<T = unknown>(pathName: string): Promise<T> {
        return JSON.parse(await this.readText(pathName)) as T
      },
    }
  }

  async write(entries: Record<string, Uint8Array | string>, options: ZipPackWriteOptions = {}): Promise<Uint8Array> {
    const validatePaths = options.validatePaths !== false
    const localParts: Buffer[] = []
    const centralParts: Buffer[] = []
    let offset = 0

    for (const [entryPath, entryValue] of Object.entries(entries)) {
      if (validatePaths) assertSafeZipPath(entryPath)
      const name = Buffer.from(entryPath, 'utf-8')
      const data = Buffer.isBuffer(entryValue)
        ? entryValue
        : typeof entryValue === 'string'
          ? Buffer.from(entryValue, 'utf-8')
          : Buffer.from(entryValue)
      const crc = crc32(data)

      const local = Buffer.alloc(30 + name.length)
      local.writeUInt32LE(LOCAL_FILE_SIGNATURE, 0)
      local.writeUInt16LE(20, 4)
      local.writeUInt16LE(0, 6)
      local.writeUInt16LE(0, 8)
      local.writeUInt16LE(0, 10)
      local.writeUInt16LE(0, 12)
      local.writeUInt32LE(crc, 14)
      local.writeUInt32LE(data.length, 18)
      local.writeUInt32LE(data.length, 22)
      local.writeUInt16LE(name.length, 26)
      local.writeUInt16LE(0, 28)
      name.copy(local, 30)
      localParts.push(local, data)

      const central = Buffer.alloc(46 + name.length)
      central.writeUInt32LE(CENTRAL_FILE_SIGNATURE, 0)
      central.writeUInt16LE(20, 4)
      central.writeUInt16LE(20, 6)
      central.writeUInt16LE(0, 8)
      central.writeUInt16LE(0, 10)
      central.writeUInt16LE(0, 12)
      central.writeUInt16LE(0, 14)
      central.writeUInt32LE(crc, 16)
      central.writeUInt32LE(data.length, 20)
      central.writeUInt32LE(data.length, 24)
      central.writeUInt16LE(name.length, 28)
      central.writeUInt16LE(0, 30)
      central.writeUInt16LE(0, 32)
      central.writeUInt16LE(0, 34)
      central.writeUInt16LE(0, 36)
      central.writeUInt32LE(0, 38)
      central.writeUInt32LE(offset, 42)
      name.copy(central, 46)
      centralParts.push(central)

      offset += local.length + data.length
    }

    const centralOffset = offset
    const centralDirectory = Buffer.concat(centralParts)
    const eocd = Buffer.alloc(22)
    eocd.writeUInt32LE(EOCD_SIGNATURE, 0)
    eocd.writeUInt16LE(0, 4)
    eocd.writeUInt16LE(0, 6)
    eocd.writeUInt16LE(centralParts.length, 8)
    eocd.writeUInt16LE(centralParts.length, 10)
    eocd.writeUInt32LE(centralDirectory.length, 12)
    eocd.writeUInt32LE(centralOffset, 16)
    eocd.writeUInt16LE(0, 20)

    return Buffer.concat([...localParts, centralDirectory, eocd])
  }
}

export function assertSafeZipPath(entryPath: string): void {
  if (!entryPath || entryPath.includes('\\') || entryPath.startsWith('/') || /^[A-Za-z]:/.test(entryPath)) {
    throw new Error(`Unsafe ZIP entry path: ${entryPath}`)
  }
  const parts = entryPath.split('/')
  if (parts.some((part) => part === '' || part === '.' || part === '..')) {
    throw new Error(`Unsafe ZIP entry path: ${entryPath}`)
  }
}

function parseCentralDirectory(buffer: Buffer, maxFileBytes: number): InternalZipEntry[] {
  const eocdOffset = findEocd(buffer)
  if (eocdOffset < 0) throw new Error('Invalid ZIP archive: missing end of central directory.')
  const entryCount = buffer.readUInt16LE(eocdOffset + 10)
  const centralSize = buffer.readUInt32LE(eocdOffset + 12)
  const centralOffset = buffer.readUInt32LE(eocdOffset + 16)
  if (centralOffset + centralSize > buffer.length) {
    throw new Error('Invalid ZIP archive: central directory exceeds archive size.')
  }

  const entries: InternalZipEntry[] = []
  let cursor = centralOffset
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== CENTRAL_FILE_SIGNATURE) {
      throw new Error('Invalid ZIP archive: malformed central directory entry.')
    }
    const flags = buffer.readUInt16LE(cursor + 8)
    const compressionMethod = buffer.readUInt16LE(cursor + 10)
    const compressedSize = buffer.readUInt32LE(cursor + 20)
    const uncompressedSize = buffer.readUInt32LE(cursor + 24)
    const nameLength = buffer.readUInt16LE(cursor + 28)
    const extraLength = buffer.readUInt16LE(cursor + 30)
    const commentLength = buffer.readUInt16LE(cursor + 32)
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42)
    const nameStart = cursor + 46
    const nameEnd = nameStart + nameLength
    if (nameEnd + extraLength + commentLength > buffer.length) {
      throw new Error('Invalid ZIP archive: central directory entry exceeds archive size.')
    }
    const entryPath = buffer.subarray(nameStart, nameEnd).toString('utf-8')
    if (uncompressedSize > maxFileBytes) {
      throw new Error(`ZIP entry exceeds maximum file size: ${entryPath}`)
    }
    if (compressionMethod !== 0 && compressionMethod !== 8) {
      throw new Error(`Unsupported ZIP compression method ${compressionMethod} for ${entryPath}`)
    }
    if ((flags & 0x1) !== 0) {
      throw new Error(`Encrypted ZIP entries are not supported: ${entryPath}`)
    }
    const dataOffset = localDataOffset(buffer, localHeaderOffset)
    if (dataOffset + compressedSize > buffer.length) {
      throw new Error(`Invalid ZIP archive: entry data exceeds archive size for ${entryPath}`)
    }
    entries.push({
      path: entryPath,
      compressedSize,
      uncompressedSize,
      compressionMethod,
      dataOffset,
      source: buffer,
    })
    cursor = nameEnd + extraLength + commentLength
  }

  return entries.filter((entry) => !entry.path.endsWith('/'))
}

function localDataOffset(buffer: Buffer, localHeaderOffset: number): number {
  if (localHeaderOffset + 30 > buffer.length || buffer.readUInt32LE(localHeaderOffset) !== LOCAL_FILE_SIGNATURE) {
    throw new Error('Invalid ZIP archive: malformed local file header.')
  }
  const nameLength = buffer.readUInt16LE(localHeaderOffset + 26)
  const extraLength = buffer.readUInt16LE(localHeaderOffset + 28)
  return localHeaderOffset + 30 + nameLength + extraLength
}

function findEocd(buffer: Buffer): number {
  const min = Math.max(0, buffer.length - 0xffff - 22)
  for (let index = buffer.length - 22; index >= min; index -= 1) {
    if (buffer.readUInt32LE(index) === EOCD_SIGNATURE) return index
  }
  return -1
}

function publicEntry(entry: InternalZipEntry): ZipPackEntry {
  return {
    path: entry.path,
    compressedSize: entry.compressedSize,
    uncompressedSize: entry.uncompressedSize,
    compressionMethod: entry.compressionMethod,
  }
}

function readEntryBytes(entry: InternalZipEntry): Uint8Array {
  const compressed = entry.source.subarray(entry.dataOffset, entry.dataOffset + entry.compressedSize)
  if (entry.compressionMethod === 0) return Buffer.from(compressed)
  const inflated = inflateRawSync(compressed)
  if (inflated.length !== entry.uncompressedSize) {
    throw new Error(`ZIP entry size mismatch: ${entry.path}`)
  }
  return inflated
}

function crc32(data: Uint8Array): number {
  const table = getCrcTable()
  let crc = 0xffffffff
  for (const byte of data) {
    crc = (crc >>> 8) ^ table[(crc ^ byte) & 0xff]
  }
  return (crc ^ 0xffffffff) >>> 0
}

function getCrcTable(): number[] {
  if (crcTable) return crcTable
  crcTable = Array.from({ length: 256 }, (_, index) => {
    let c = index
    for (let bit = 0; bit < 8; bit += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    }
    return c >>> 0
  })
  return crcTable
}
