import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'

export function imageRuntimeTarget(triple: string): string {
  const targets: Record<string, string> = {
    'x86_64-pc-windows-msvc': 'win32-x64', 'aarch64-pc-windows-msvc': 'win32-arm64',
    'x86_64-apple-darwin': 'darwin-x64', 'aarch64-apple-darwin': 'darwin-arm64',
    'x86_64-unknown-linux-gnu': 'linux-x64', 'aarch64-unknown-linux-gnu': 'linux-arm64',
    'x86_64-unknown-linux-musl': 'linuxmusl-x64', 'aarch64-unknown-linux-musl': 'linuxmusl-arm64',
  }
  const target = targets[triple]
  if (!target) throw new Error('Unsupported image runtime target: ' + triple)
  return target
}

/** Copy the installed dependency closure, not only sharp's JS. Never download at runtime. */
export async function copyBundledImageRuntime(repoRoot: string, appRoot: string, triple: string) {
  const target = imageRuntimeTarget(triple)
  const runtimeDir = path.join(appRoot, 'binaries', 'image-runtime')
  const modulesDir = path.join(runtimeDir, 'node_modules')
  const packages = new Map<string, string>()
  const resolveFrom = createRequire(path.join(repoRoot, 'package.json'))
  const copyPackage = async (name: string, resolver: NodeRequire): Promise<void> => {
    if (!/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(name)) throw new Error('Invalid runtime package name')
    const manifestPath = resolver.resolve(name + '/package.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    if (packages.has(name)) {
      if (packages.get(name) !== manifest.version) throw new Error('Conflicting runtime dependency: ' + name)
      return
    }
    packages.set(name, manifest.version)
    await mkdir(path.dirname(path.join(modulesDir, name)), { recursive: true })
    await cp(path.dirname(manifestPath), path.join(modulesDir, name), { recursive: true, dereference: true })
    const childResolver = createRequire(manifestPath)
    for (const dependency of Object.keys(manifest.dependencies ?? {})) await copyPackage(dependency, childResolver)
    // Sharp's optional list contains every OS/CPU. Only the exact target belongs in this app.
    for (const dependency of Object.keys(manifest.optionalDependencies ?? {})) {
      if (dependency === '@img/sharp-' + target || dependency === '@img/sharp-libvips-' + target) {
        await copyPackage(dependency, childResolver)
      }
    }
  }
  await copyPackage('sharp', resolveFrom)
  if (!packages.has('@img/sharp-' + target)) throw new Error('Missing native Sharp runtime for ' + target)
  const receipt = { target, packages: Object.fromEntries(packages) }
  await writeFile(path.join(runtimeDir, 'runtime.json'), JSON.stringify(receipt, null, 2) + '\n')
  return receipt
}
