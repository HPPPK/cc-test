import type { TerminalQuerier } from '../ink/terminal-querier.js'
import type { SystemTheme } from './systemTheme.js'
import { unsupportedFeature } from './unsupportedFeature.js'
export function watchSystemTheme(_querier: TerminalQuerier, _onTheme: (theme: SystemTheme) => void): () => void { return unsupportedFeature('live-system-theme') }
