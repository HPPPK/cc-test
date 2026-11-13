import type { LspServerConfig, LspServerState, ScopedLspServerConfig } from './types.js'
const config: LspServerConfig = { command: 'server', extensionToLanguage: { '.ts': 'typescript' }, transport: 'stdio' }
const scoped: ScopedLspServerConfig = { ...config, scope: 'dynamic', source: 'plugin-name' }
// @ts-expect-error LSP transport follows the authoritative plugin schema
const invalid: LspServerConfig = { ...config, transport: 'http' }
// @ts-expect-error only implemented server lifecycle states are accepted
const badState: LspServerState = 'invented'
void [config, scoped, invalid, badState]
