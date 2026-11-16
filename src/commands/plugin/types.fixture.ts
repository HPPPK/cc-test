import type { ViewState } from './types.js'
import type { UnifiedInstalledItem } from './unifiedTypes.js'
const view: ViewState = { type: 'manage-plugins', targetPlugin: 'example', action: 'enable' }
// @ts-expect-error command UI actions are closed to implemented transitions
const invalid: ViewState = { type: 'manage-plugins', action: 'invented' }
const flagged: UnifiedInstalledItem = { type: 'flagged-plugin', id: 'p@m', name: 'p', marketplace: 'm', scope: 'flagged', reason: 'delisted', text: 'Removed', flaggedAt: 'now' }
// @ts-expect-error MCP rows require their actual connection and status
const badMcp: UnifiedInstalledItem = { type: 'mcp', id: 'mcp:local', name: 'local', scope: 'user' }
void [view, invalid, flagged, badMcp]
