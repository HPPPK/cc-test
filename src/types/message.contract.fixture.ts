import type { Message, UserMessage, AssistantMessage, SystemCompactBoundaryMessage } from './message.js'
import type { QueueOperationMessage } from './messageQueueTypes.js'

declare const message: Message
if (message.type === 'user') {
  const role: 'user' = message.message.role
  // @ts-expect-error User messages never carry assistant transport roles
  const invalidRole: 'assistant' = message.message.role
  void [role, invalidRole]
}
if (message.type === 'assistant') {
  const role: 'assistant' = message.message.role
  const tokens: number = message.message.usage.input_tokens
  void [role, tokens]
}
if (message.type === 'system' && message.subtype === 'compact_boundary') {
  const trigger: 'manual' | 'auto' = message.compactMetadata.trigger
  void trigger
}
// @ts-expect-error An envelope's role must agree with its discriminator
const invalidUser: UserMessage = { type: 'user', message: { role: 'assistant', content: 'bad' }, uuid: '00000000-0000-0000-0000-000000000000', timestamp: '' }
// @ts-expect-error API content and usage cannot be omitted
const invalidAssistant: AssistantMessage = { type: 'assistant', message: { role: 'assistant' }, uuid: '00000000-0000-0000-0000-000000000000', timestamp: '' }
// @ts-expect-error Compact boundaries require actual compaction metadata
const invalidCompact: SystemCompactBoundaryMessage = { type: 'system', subtype: 'compact_boundary', uuid: '00000000-0000-0000-0000-000000000000', timestamp: '', content: '' }
// @ts-expect-error Queue operation must be a known producer operation
const invalidQueue: QueueOperationMessage = { type: 'queue-operation', operation: 'invented', sessionId: '', timestamp: '' }
void [invalidUser, invalidAssistant, invalidCompact, invalidQueue]

import type { BashProgress, MCPProgress } from './tools.js'
// @ts-expect-error Shell progress must contain concrete output and timing data
const invalidBash: BashProgress = { type: 'bash_progress' }
// @ts-expect-error MCP progress status is a producer discriminator
const invalidMcp: MCPProgress = { type: 'mcp_progress', status: 'made-up', serverName: 'fixture', toolName: 'read' }
void [invalidBash, invalidMcp]

function exhaustiveEnvelope(value: Message): void {
  switch (value.type) {
    case 'user': value.message.role satisfies 'user'; return
    case 'assistant': value.message.role satisfies 'assistant'; return
    case 'attachment': value.attachment.type satisfies string; return
    case 'progress': value.data.type satisfies string; return
    case 'system': {
      switch (value.subtype) {
        case 'informational': case 'local_command': case 'permission_retry': case 'bridge_status':
        case 'scheduled_task_fire': case 'stop_hook_summary': case 'turn_duration': case 'away_summary':
        case 'memory_saved': case 'agents_killed': case 'api_metrics': case 'compact_boundary':
        case 'microcompact_boundary': case 'api_error': case 'file_snapshot': case 'thinking': return
        default: value satisfies never
      }
      return
    }
    default: value satisfies never
  }
}
void exhaustiveEnvelope

import type { Attachment } from '../utils/attachments.js'
import type { REPLToolProgress } from './tools.js'
const queuedInput: Attachment = { type: 'queued_command', prompt: 'quoted text', messageKind: 'user_input', isSynthetic: true, isCompactSummary: false }
const legacyRepl: REPLToolProgress = { type: 'repl_tool_call', phase: 'start', toolName: 'Read', toolInput: { file_path: 'fixture' } }
// @ts-expect-error Historic REPL data requires a validated phase, not an arbitrary string
const invalidRepl: REPLToolProgress = { type: 'repl_tool_call', phase: 'invented', toolName: 'Read', toolInput: {} }
void [queuedInput, legacyRepl, invalidRepl]

import type { QuerySource } from '../constants/querySource.js'
import type { DiscoverySignal } from '../services/skillSearch/signals.js'
const customQuerySource: QuerySource = 'custom-hook-origin'
const documentedDiscoveryTrigger: DiscoverySignal = 'subagent_spawn'
// @ts-expect-error Query sources are textual telemetry/routing origins
const invalidQuerySource: QuerySource = 42
// @ts-expect-error Discovery triggers must have an evidenced integration contract
const invalidDiscoveryTrigger: DiscoverySignal = 'invented-trigger'
void [customQuerySource, documentedDiscoveryTrigger, invalidQuerySource, invalidDiscoveryTrigger]

import type { RenderableMessage, ProgressMessage } from './message.js'
declare const toolProgressEnvelope: ProgressMessage
// @ts-expect-error Progress has its own live UI path and cannot enter static message navigation
const staticProgress: RenderableMessage = toolProgressEnvelope
void staticProgress
