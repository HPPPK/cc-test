import type { StdoutMessage } from '../../entrypoints/sdk/controlTypes.js'

/** Common capabilities implemented by both WebSocket and SSE transports. */
export interface Transport {
  connect(): Promise<void>
  write(message: StdoutMessage): Promise<void>
  close(): void
  setOnData(callback: (data: string) => void): void
  setOnClose(callback: (closeCode?: number) => void): void
  isConnectedStatus(): boolean
  isClosedStatus(): boolean
}
