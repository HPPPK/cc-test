import type { SDKControlRequest } from './controlTypes.js'
import type { PermissionUpdate, SDKUserMessage } from './coreTypes.js'
import type { Settings } from './settingsTypes.generated.js'
import type { HookCallback, InferShape } from './runtimeTypes.js'
import type { z } from 'zod/v4'
const request: SDKControlRequest = { type: 'control_request', request_id: 'r', request: { subtype: 'set_model', model: 'local' } }
// @ts-expect-error unknown control requests must not pass
const invalid: SDKControlRequest = { type: 'control_request', request_id: 'r', request: { subtype: 'invented' } }
// @ts-expect-error permission behavior is a closed enum
const permission: PermissionUpdate = { type: 'addRules', rules: [], behavior: 'invented', destination: 'session' }
const settings: Settings = { env: { EXAMPLE: 'value' } }
// @ts-expect-error env must contain strings
const badSettings: Settings = { env: { EXAMPLE: 123 } }
const user: SDKUserMessage = { type: 'user', message: { role: 'user', content: 'hello' }, parent_tool_use_id: null, session_id: 's' }
// @ts-expect-error user message role is fixed
const badUser: SDKUserMessage = { type: 'user', message: { role: 'assistant', content: 'hello' }, parent_tool_use_id: null, session_id: 's' }
const hook: HookCallback = async (_input, _toolUseId, options) => { options.signal.throwIfAborted(); return { continue: true } }
type Shape = InferShape<{ name: z.ZodString }>
const shape: Shape = { name: 'ok' }
// @ts-expect-error MCP shape inference must preserve field types
const badShape: Shape = { name: 1 }
void [request, invalid, permission, settings, badSettings, user, badUser, hook, shape, badShape]
// @ts-expect-error MCP authentication requires its server payload
const missingServer: SDKControlRequest = { type: 'control_request', request_id: 'r', request: { subtype: 'mcp_authenticate' } }
// @ts-expect-error JSON-RPC messages require a protocol version
const badRpc: SDKControlRequest = { type: 'control_request', request_id: 'r', request: { subtype: 'mcp_message', server_name: 'mcp', message: { method: 'tools/list' } } }
// @ts-expect-error message identity stays a closed provenance vocabulary
const badIdentity: SDKUserMessage = { type: 'user', message: { role: 'user', content: 'hello' }, parent_tool_use_id: null, messageKind: 'invented' }
void [missingServer, badRpc, badIdentity]
