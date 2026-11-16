import type { Terminal, Continue } from './transitions.js'
const terminal: Terminal = { reason: 'model_error', error: new Error('fixture') }
const continued: Continue = { reason: 'collapse_drain_retry', committed: 2 }
// @ts-expect-error continuation recovery requires an attempt counter
const missing: Continue = { reason: 'max_output_tokens_recovery' }
// @ts-expect-error terminal reasons only describe implemented exits
const invalid: Terminal = { reason: 'invented' }
void [terminal, continued, missing, invalid]
