/** Types with callbacks, streams, or in-process instances cannot be JSON schemas. */
import type { z } from 'zod/v4'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js'
import type { AgentDefinition, HookEvent, HookInput, HookJSONOutput, McpServerConfigForProcessTransport, ModelInfo, AccountInfo, PermissionMode, PermissionResult, PermissionUpdate, RewindFilesResult, SDKMessage, SDKResultMessage, SDKUserMessage, SlashCommand } from './coreTypes.js'
import type { Settings } from './settingsTypes.generated.js'

export type EffortLevel = 'low' | 'medium' | 'high' | 'max'
export type AnyZodRawShape = Record<string, z.ZodType>
export type InferShape<Shape extends AnyZodRawShape> = { [K in keyof Shape]: z.output<Shape[K]> }
export type SdkMcpToolDefinition<Shape extends AnyZodRawShape = AnyZodRawShape> = {
  name: string
  description: string
  inputSchema: Shape
  handler: (args: InferShape<Shape>, extra: unknown) => Promise<CallToolResult>
  annotations?: ToolAnnotations
  searchHint?: string
  alwaysLoad?: boolean
}
export type McpSdkServerConfigWithInstance = { type: 'sdk'; name: string; instance: McpServer }
export type HookCallback = (input: HookInput, toolUseID: string | undefined, options: { signal: AbortSignal }) => Promise<HookJSONOutput>
export type HookCallbackMatcher = { matcher?: string; hooks: HookCallback[]; timeout?: number }
export type CanUseTool = (toolName: string, input: Record<string, unknown>, options: {
  signal: AbortSignal
  suggestions?: PermissionUpdate[]
  blockedPath?: string
  decisionReason?: string
  toolUseID: string
  agentID?: string
}) => Promise<PermissionResult>
export type Options = {
  abortController?: AbortController
  cwd?: string
  model?: string
  fallbackModel?: string
  maxTurns?: number
  maxBudgetUsd?: number
  maxThinkingTokens?: number
  effort?: EffortLevel
  permissionMode?: PermissionMode
  allowDangerouslySkipPermissions?: boolean
  allowedTools?: string[]
  disallowedTools?: string[]
  additionalDirectories?: string[]
  canUseTool?: CanUseTool
  hooks?: Partial<Record<HookEvent, HookCallbackMatcher[]>>
  agents?: Record<string, AgentDefinition>
  mcpServers?: Record<string, McpServerConfigForProcessTransport | McpSdkServerConfigWithInstance>
  settings?: string | Settings
  settingSources?: ('user' | 'project' | 'local')[]
  resume?: string
  continue?: boolean
  forkSession?: boolean
  env?: Record<string, string | undefined>
  stderr?: (data: string) => void
  includePartialMessages?: boolean
  systemPrompt?: string | { type: 'preset'; preset: 'claude_code'; append?: string }
}
export type InternalOptions = Options & { enableRemoteControl?: boolean }
export interface Query extends AsyncGenerator<SDKMessage, void> {
  interrupt(): Promise<void>
  setPermissionMode(mode: PermissionMode): Promise<void>
  setModel(model?: string): Promise<void>
  setMaxThinkingTokens(maxThinkingTokens: number | null): Promise<void>
  supportedCommands(): Promise<SlashCommand[]>
  supportedModels(): Promise<ModelInfo[]>
  accountInfo(): Promise<AccountInfo>
  rewindFiles(userMessageId: string, options?: { dryRun?: boolean }): Promise<RewindFilesResult>
  streamInput(stream: AsyncIterable<SDKUserMessage>): Promise<void>
  close(): void
}
export type InternalQuery = Query
export type SDKSessionOptions = Pick<Options, 'model' | 'cwd' | 'env' | 'permissionMode' | 'allowedTools' | 'disallowedTools' | 'canUseTool' | 'hooks' | 'mcpServers' | 'systemPrompt' | 'abortController'>
export interface SDKSession {
  readonly sessionId: string
  send(message: string | SDKUserMessage): Promise<void>
  stream(): AsyncGenerator<SDKMessage, void>
  close(): Promise<void>
}
export type SessionMutationOptions = { dir?: string }
export type GetSessionInfoOptions = SessionMutationOptions
export type ListSessionsOptions = SessionMutationOptions & { limit?: number; offset?: number }
export type GetSessionMessagesOptions = ListSessionsOptions & { includeSystemMessages?: boolean }
export type ForkSessionOptions = SessionMutationOptions & { upToMessageId?: string; title?: string }
export type ForkSessionResult = { sessionId: string }
export type SessionMessage = Extract<SDKMessage, { type: 'user' | 'assistant' | 'system' }>
