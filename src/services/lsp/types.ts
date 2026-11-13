import type { z } from 'zod/v4'
import type { LspServerConfigSchema } from '../../utils/plugins/schemas.js'
import type { ConfigScope } from '../mcp/types.js'

export type LspServerConfig = z.output<ReturnType<typeof LspServerConfigSchema>>
export type ScopedLspServerConfig = LspServerConfig & { scope: ConfigScope, source: string }
export type LspServerState = 'stopped' | 'starting' | 'running' | 'stopping' | 'error'
