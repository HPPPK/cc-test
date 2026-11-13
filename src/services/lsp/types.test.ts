import { expect, test } from 'bun:test'
import { LspServerConfigSchema } from '../../utils/plugins/schemas.js'
import type { LspServerConfig } from './types.js'

test('LSP contracts use the authoritative schema output and default transport', () => {
  const config: LspServerConfig = LspServerConfigSchema().parse({ command: 'language-server', extensionToLanguage: { '.ts': 'typescript' } })
  expect(config.transport).toBe('stdio')
  expect(LspServerConfigSchema().safeParse({ ...config, transport: 'http' }).success).toBe(false)
})
