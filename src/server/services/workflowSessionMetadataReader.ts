import { open } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import type { WorkflowSessionMetadata } from './workflowTypes.js'

const BLOCK_BYTES = 64 * 1024
const MAX_METADATA_BYTES = 8 * 1024 * 1024

export function workflowMetadataDecision(entry: Record<string, unknown>): { workflow?: WorkflowSessionMetadata } | undefined {
  if (entry.type !== 'session-meta' || !Object.hasOwn(entry, 'workflow')) return undefined
  const workflow = entry.workflow
  return workflow && typeof workflow === 'object' && !Array.isArray(workflow)
    && (workflow as Record<string, unknown>).mode === 'workflow'
    ? { workflow: workflow as WorkflowSessionMetadata }
    : {}
}

// Inspect only top-level type, regardless of key order. Large messages are
// traversed as bytes without retaining their strings or decoding their bodies.
async function isMetadataLine(file: FileHandle, start: number, end: number): Promise<boolean> {
  let depth = 0
  let quoted = false
  let escaped = false
  let expectingKey = false
  let expectingValue = false
  let key = ''
  let type = ''
  let capture: 'key' | 'type' | undefined
  let token: number[] = []
  const block = Buffer.alloc(BLOCK_BYTES)
  for (let position = start; position < end;) {
    const { bytesRead } = await file.read(block, 0, Math.min(block.length, end - position), position)
    if (!bytesRead) return false
    position += bytesRead
    for (const byte of block.subarray(0, bytesRead)) {
      if (quoted) {
        if (!escaped && byte === 34) {
          quoted = false
          let value = ''
          try { value = JSON.parse('"' + Buffer.from(token).toString('utf8') + '"') } catch {}
          if (capture === 'type') type = value
          if (capture === 'key') { key = value; expectingKey = false }
          else if (depth === 1) expectingValue = false
          capture = undefined
        } else {
          if (capture && token.length < 256) token.push(byte)
          if (escaped) escaped = false
          else if (byte === 92) escaped = true
        }
        continue
      }
      if (byte === 34) {
        quoted = true; escaped = false; token = []
        capture = depth === 1 && expectingKey ? 'key'
          : depth === 1 && expectingValue && key === 'type' ? 'type' : undefined
      } else if (byte === 123 || byte === 91) {
        depth++
        if (depth === 1 && byte === 123) expectingKey = true
      } else if (byte === 125 || byte === 93) depth--
      else if (depth === 1 && byte === 58) { expectingKey = false; expectingValue = true }
      else if (depth === 1 && byte === 44) { expectingKey = true; expectingValue = false; key = '' }
    }
  }
  return type === 'session-meta'
}

/** Read only the latest explicit workflow metadata; no transcript projection or cache. */
export async function readWorkflowSessionMetadata(filePath: string): Promise<{ workflow?: WorkflowSessionMetadata }> {
  const file = await open(filePath, 'r')
  try {
    const size = (await file.stat()).size
    const inspect = async (start: number, end: number) => {
      if (end <= start || !await isMetadataLine(file, start, end)) return undefined
      if (end - start > MAX_METADATA_BYTES) throw new Error('Workflow session metadata exceeds the supported 8 MiB bound.')
      const bytes = Buffer.alloc(end - start)
      let offset = 0
      while (offset < bytes.length) {
        const { bytesRead } = await file.read(bytes, offset, bytes.length - offset, start + offset)
        if (!bytesRead) return undefined
        offset += bytesRead
      }
      try { return workflowMetadataDecision(JSON.parse(bytes.toString('utf8').trim())) } catch { return undefined }
    }
    const block = Buffer.alloc(BLOCK_BYTES)
    let end = size
    for (let position = size; position > 0;) {
      const start = Math.max(0, position - block.length)
      const { bytesRead } = await file.read(block, 0, position - start, start)
      for (let index = bytesRead - 1; index >= 0; index--) {
        if (block[index] !== 10) continue
        const decision = await inspect(start + index + 1, end)
        if (decision) return decision
        end = start + index
      }
      position = start
    }
    return await inspect(0, end) ?? {}
  } finally { await file.close() }
}
