import { expect, test } from 'bun:test'
import { validateManifest, parseAndValidateManifestFromText } from './helpers.js'

test('the installed manifest SDK validates the supported server bundle contract', async () => {
  const manifest = await validateManifest({
    manifest_version: '0.3', name: 'contract-fixture', version: '1.0.0', description: 'Contract regression',
    author: { name: 'Fixture' },
    server: { type: 'node', entry_point: 'server.js', mcp_config: { command: 'node', args: ['${__dirname}/server.js'] } },
  })
  expect(manifest.name).toBe('contract-fixture')
  expect(manifest.server.mcp_config.command).toBe('node')
  await expect(validateManifest({ ...manifest, server: { type: 'invented' } })).rejects.toThrow('Invalid manifest')
  await expect(parseAndValidateManifestFromText('{invalid')).rejects.toThrow('Invalid JSON')
})
