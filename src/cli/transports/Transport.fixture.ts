import type { Transport } from './Transport.js'
import type { StdoutMessage } from '../../entrypoints/sdk/controlTypes.js'
const transport: Transport = { connect: async () => {}, write: async (_message: StdoutMessage) => {}, close: () => {}, setOnData: (_callback: (data: string) => void) => {}, setOnClose: (_callback: (code?: number) => void) => {}, isConnectedStatus: () => false, isClosedStatus: () => true }
// @ts-expect-error output transport accepts protocol messages, not raw strings
transport.write('invalid')
void transport
