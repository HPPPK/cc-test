/** Tool progress contracts follow the concrete tool producers, never provider payloads. */
import type { TaskType } from '../Task.js'
import type { AgentId } from './ids.js'
import type { AssistantMessage, NormalizedUserMessage } from './message.js'

type ShellOutput = {
  output: string
  fullOutput: string
  elapsedTimeSeconds: number
  totalLines: number
  totalBytes?: number
  taskId?: string
  timeoutMs?: number
}
export type BashProgress = ShellOutput & { type: 'bash_progress' }
export type PowerShellProgress = ShellOutput & { type: 'powershell_progress'; totalBytes: number }
export type ShellProgress = BashProgress | PowerShellProgress
export type AgentToolProgress = {
  type: 'agent_progress'
  message: AssistantMessage | NormalizedUserMessage
  prompt: string
  agentId: AgentId
}
export type SkillToolProgress = {
  type: 'skill_progress'
  message: AssistantMessage | NormalizedUserMessage
  prompt: string
  agentId: AgentId
}
export type MCPProgress = {
  type: 'mcp_progress'
  serverName: string
  toolName: string
} & (
  | { status: 'started'; progress?: never; total?: never; progressMessage?: never; elapsedTimeMs?: never }
  | { status: 'completed' | 'failed'; elapsedTimeMs: number; progress?: never; total?: never; progressMessage?: never }
  | { status: 'progress'; progress: number; total?: number; progressMessage?: string }
)
export type WebSearchProgress =
  | { type: 'query_update'; query: string }
  | { type: 'search_results_received'; resultCount: number; query: string }
export type TaskOutputProgress = { type: 'waiting_for_task'; taskDescription: string; taskType: TaskType }
/** Historical read contract retained for persisted REPL progress consumed by collapsed tool UI. */
export type REPLToolProgress = {
  type: 'repl_tool_call'
  phase: 'start'
  toolName: string
  toolInput: unknown
}
/** No workflow progress producer/schema is shipped; do not invent an upstream payload. */
export type SdkWorkflowProgress = never
export type ToolProgressData = REPLToolProgress | ShellProgress | AgentToolProgress | SkillToolProgress | MCPProgress | WebSearchProgress | TaskOutputProgress
