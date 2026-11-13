export const MANAGED_NODE_VERSION = '22.23.1'

export function getManagedNodeRuntime(targetTriple: string) {
  const targets: Record<string, { platform: string; sha256: string }> = {
    'x86_64-pc-windows-msvc': { platform: 'win-x64', sha256: '7df0bc9375723f4a86b3aa1b7cc73342423d9677a8df4538aca31a049e309c29' },
    'aarch64-apple-darwin': { platform: 'darwin-arm64', sha256: 'ef28d8fab2c0e4314522d4bb1b7173270aa3937e93b92cb7de79c112ac1fa953' },
    'x86_64-apple-darwin': { platform: 'darwin-x64', sha256: 'b8da981b8a0b1241b70249204916da76c63573ddf5814dbd2d1e41069105cb81' },
  }
  const target = targets[targetTriple]
  if (!target) return null
  const windows = target.platform === 'win-x64'
  const directory = `node-v${MANAGED_NODE_VERSION}-${target.platform}`
  const archive = `${directory}.${windows ? 'zip' : 'tar.gz'}`
  return { ...target, directory, archive, windows, executable: windows ? 'node.exe' : 'bin/node', url: `https://nodejs.org/dist/v${MANAGED_NODE_VERSION}/${archive}` }
}
