import type { ConfigScope, MCPServerConnection } from '../../services/mcp/types.js'
import type { LoadedPlugin, PluginError } from '../../types/plugin.js'
import type { PersistablePluginScope } from '../../utils/plugins/pluginIdentifier.js'

type BaseItem = { id: string, name: string, description?: string }
export type UnifiedInstalledItem =
  | (BaseItem & {
      type: 'plugin'
      marketplace: string
      scope: PersistablePluginScope | 'builtin'
      isEnabled: boolean
      errorCount: number
      errors: PluginError[]
      plugin: LoadedPlugin
      pendingEnable?: boolean
      pendingUpdate?: boolean
      pendingToggle?: 'will-enable' | 'will-disable'
    })
  | (BaseItem & { type: 'failed-plugin', marketplace: string, scope: PersistablePluginScope, errorCount: number, errors: PluginError[] })
  | (BaseItem & { type: 'flagged-plugin', marketplace: string, scope: 'flagged', reason: string, text: string, flaggedAt: string })
  | (BaseItem & { type: 'mcp', scope: ConfigScope, status: MCPServerConnection['type'], client: MCPServerConnection, indented?: boolean })
