import type { TerminalEvent } from './terminal-event.js'
/** Reserved handler contract; no dedicated payload producer exists in this build. */
export type PasteEvent = TerminalEvent & { readonly type: 'paste' }
