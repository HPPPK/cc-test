import type { SDKMessage, PermissionResult } from '../entrypoints/sdk/coreTypes.js'
import type { SDKControlPermissionRequest } from '../entrypoints/sdk/controlTypes.js'
import type { RemoteMessageContent } from '../utils/teleport/api.js'

/** Consumer contract only; the build does not contain an SSH manager implementation. */
export type SSHSessionCallbacks = {
  onMessage(message: SDKMessage): void
  onPermissionRequest(request: SDKControlPermissionRequest, requestId: string): void
  onConnected(): void
  onReconnecting(attempt: number, max: number): void
  onDisconnected(): void
  onError(error: Error): void
}
export interface SSHSessionManager {
  connect(): void
  disconnect(): void
  sendMessage(content: RemoteMessageContent): Promise<boolean>
  sendInterrupt(): void
  respondToPermissionRequest(requestId: string, result: PermissionResult): void
}
