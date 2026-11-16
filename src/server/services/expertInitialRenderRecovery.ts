import { createHash } from 'node:crypto'
import type { MessageEntry } from './sessionService.js'

type Block = Record<string, unknown>
function blocks(message: MessageEntry): Block[] {
  return Array.isArray(message.content)
    ? message.content.filter((block): block is Block => Boolean(block) && typeof block === 'object')
    : []
}

/** Read receipts, not the model's claim that it tried. Never include child work. */
export function latestInitialRenderAttempt(messages: MessageEntry[]): { id: string; errorCode?: string; failureFingerprint?: string } | undefined {
  return reportRenderAttempts(messages).at(-1)
}

export function reportRenderAttempts(messages: MessageEntry[]): Array<{ id: string; errorCode?: string; failureFingerprint?: string }> {
  const renderCalls = new Set<string>()
  const attempts = new Map<string, { id: string; errorCode?: string; failureFingerprint?: string }>()
  for (const message of messages) {
    if (message.isSidechain || message.parentToolUseId) continue
    for (const block of blocks(message)) {
      if (block.type === 'tool_use' && typeof block.id === 'string'
        && /^(Bash|Shell|PowerShell)$/i.test(String(block.name))) {
        const input = block.input as { command?: unknown } | undefined
        if (typeof input?.command === 'string'
          && /\bexpert-template-fill\b[^\n]*--data-stdin\b/.test(input.command)) renderCalls.add(block.id)
      }
      if (block.type !== 'tool_result' || typeof block.tool_use_id !== 'string' || !renderCalls.has(block.tool_use_id)) continue
      const text = typeof block.content === 'string' ? block.content
        : Array.isArray(block.content) ? block.content.map(part => typeof part?.text === 'string' ? part.text : '').join('\n') : ''
      let structuredCode: string | undefined
      try {
        const start = text.indexOf('{')
        const body = start >= 0 ? JSON.parse(text.slice(start)) : undefined
        if (body && typeof body.code === 'string' && /^[A-Z][A-Z0-9_]+$/.test(body.code)) structuredCode = body.code
      } catch { /* Legacy plain-text tool failures keep their existing code. */ }
      attempts.set(block.tool_use_id, { id: block.tool_use_id,
        ...(block.is_error === true ? { failureFingerprint: createHash('sha256').update(text.trim()).digest('hex'), errorCode: structuredCode ?? text.match(/\b[A-Z][A-Z_]{3,}:/)?.[0].slice(0, -1) ?? 'EXPERT_INITIAL_RENDER_TOOL_ERROR' } : {}) })
    }
  }
  return [...attempts.values()]
}
