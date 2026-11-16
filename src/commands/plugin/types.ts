import type { CommandResultDisplay } from '../../commands.js'

export type ViewState =
  | { type: 'menu' | 'help' | 'marketplace-list' | 'marketplace-menu' }
  | { type: 'validate', path?: string }
  | { type: 'add-marketplace', initialValue?: string }
  | { type: 'browse-marketplace', targetMarketplace?: string, targetPlugin?: string }
  | { type: 'discover-plugins', targetPlugin?: string }
  | { type: 'manage-marketplaces', targetMarketplace?: string, action?: 'remove' | 'update' }
  | { type: 'manage-plugins', targetPlugin?: string, targetMarketplace?: string, action?: 'enable' | 'disable' | 'uninstall' }
export type PluginSettingsProps = {
  onComplete: (message?: string, options?: { display?: CommandResultDisplay }) => void
  args?: string
  showMcpRedirectMessage?: boolean
}
