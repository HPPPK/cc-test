type Outcome = 'sent' | 'backpressured' | 'dropped'
type QueuedFrame = { payload: string; bytes: number; type?: string; field?: string; chunks?: string[] }

// Only adjacent, unadorned deltas can be combined. IDs, metadata and semantic
// boundaries are never guessed away. The cap applies to unsent wire bytes.
function frame(payload: string): QueuedFrame {
  const entry: QueuedFrame = { payload, bytes: Buffer.byteLength(payload) }
  const value = JSON.parse(payload)
  if (Object.keys(value).length !== 2) return entry
  const field = value.type === 'content_delta'
    ? (typeof value.text === 'string' ? 'text' : 'toolInput')
    : value.type === 'thinking' ? 'text' : undefined
  if (field && typeof value[field] === 'string') {
    entry.type = value.type
    entry.field = field
    entry.chunks = [value[field]]
  }
  return entry
}

export class ClientOutbox {
  private pending: QueuedFrame[] = []
  private bytes = 0
  private blocked = false
  private closed = false

  constructor(
    private readonly write: (payload: string) => number,
    private readonly overflow: () => void,
    private readonly maxBytes = 16 * 1024 * 1024,
  ) {}

  send(payload: string): Outcome {
    if (this.closed) return 'dropped'
    if (!this.blocked) return this.deliver(payload)
    const entry = frame(payload)
    if (this.bytes + entry.bytes > this.maxBytes) {
      this.dispose()
      this.overflow()
      return 'dropped'
    }
    this.bytes += entry.bytes
    const last = this.pending.at(-1)
    if (entry.chunks && last?.chunks && last.type === entry.type && last.field === entry.field) {
      last.chunks.push(...entry.chunks)
      last.bytes += entry.bytes
    } else {
      this.pending.push(entry)
    }
    return 'backpressured'
  }

  drain(): void {
    if (this.closed) return
    this.blocked = false
    while (this.pending.length && !this.blocked && !this.closed) {
      const entry = this.pending.shift()!
      this.bytes -= entry.bytes
      this.deliver(entry.chunks
        ? JSON.stringify({ type: entry.type, [entry.field!]: entry.chunks.join('') })
        : entry.payload)
    }
  }

  dispose(): void {
    this.closed = true
    this.pending = []
    this.bytes = 0
  }

  private deliver(payload: string): Outcome {
    const result = this.write(payload)
    // -1 means accepted by Bun, NOT rejected. Retrying that frame duplicates it.
    if (result === -1) { this.blocked = true; return 'backpressured' }
    if (result === 0) { this.dispose(); return 'dropped' }
    return 'sent'
  }
}
