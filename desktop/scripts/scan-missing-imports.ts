/**
 * Read-only resolver preflight. Missing source is an error, never permission to
 * generate a runtime Proxy or erase a type contract. No optional targets have
 * been reviewed, so this scanner deliberately has no stub-generation path.
 * Existing generated stubs remain visible as unaudited compatibility debt;
 * their presence is not evidence of a disabled feature guard.
 */
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import ts from 'typescript'

export interface MissingImport {
  importer: string
  specifier: string
  target: string
  kind: 'type' | 'runtime'
}

const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs'])

async function isFile(file: string) {
  try { return (await stat(file)).isFile() } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) return false
    throw error
  }
}

async function* walk(dir: string): AsyncGenerator<string> {
  let entries
  try { entries = await readdir(dir, { withFileTypes: true }) } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === '__tests__') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else if (entry.isFile() && sourceExtensions.has(path.extname(entry.name)) && !/\.(test|spec|fixture)\.[cm]?[jt]sx?$/.test(entry.name)) yield full
  }
}

function candidates(base: string): string[] {
  // Node-style .js specifiers can refer to TypeScript / TSX source.
  const stem = base.replace(/\.(?:[mc]?js|jsx)$/, '')
  const replacements = stem === base ? [] : ['.ts', '.tsx', '.mts', '.cts'].map(ext => stem + ext)
  return [base, ...replacements, ...[...sourceExtensions].map(ext => base + ext), ...['.ts', '.tsx', '.js', '.mts', '.cts', '.mjs', '.cjs'].map(ext => path.join(base, 'index' + ext))]
}

function proposedTarget(base: string) {
  if (/\.(?:[mc]?js|jsx)$/.test(base)) return base.replace(/\.(?:[mc]?js|jsx)$/, '.ts')
  return path.extname(base) ? base : base + '.ts'
}

function imports(file: string, contents: string) {
  const source = ts.createSourceFile(file, contents, ts.ScriptTarget.Latest, true)
  const result: { specifier: string; kind: MissingImport['kind'] }[] = []
  function add(value: ts.Node | undefined, kind: MissingImport['kind']) {
    if (value && ts.isStringLiteralLike(value) && value.text.startsWith('.')) result.push({ specifier: value.text, kind })
  }
  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause
      const named = clause?.namedBindings
      const onlyTypes = clause?.isTypeOnly || (!clause?.name && named && ts.isNamedImports(named) && named.elements.length > 0 && named.elements.every(item => item.isTypeOnly))
      add(node.moduleSpecifier, onlyTypes ? 'type' : 'runtime')
    } else if (ts.isExportDeclaration(node)) {
      add(node.moduleSpecifier, node.isTypeOnly ? 'type' : 'runtime')
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      add(node.argument.literal, 'type')
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      add(node.moduleReference.expression, node.isTypeOnly ? 'type' : 'runtime')
    } else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
      add(node.arguments[0], 'runtime')
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return result
}

export async function scanMissingImports(repoRoot: string) {
  const missing: MissingImport[] = []
  const unauditedStubs = new Set<string>()
  let scannedFiles = 0
  const relative = (file: string) => path.relative(repoRoot, file).split(path.sep).join('/')
  for (const root of ['src', 'adapters']) {
    for await (const file of walk(path.join(repoRoot, root))) {
      scannedFiles++
      const contents = await readFile(file, 'utf8')
      if (contents.startsWith('// @generated stub from scan-missing-imports')) unauditedStubs.add(relative(file))
      for (const entry of imports(file, contents)) {
        const base = path.resolve(path.dirname(file), entry.specifier)
        let resolved: string | undefined
        for (const candidate of candidates(base)) {
          if (await isFile(candidate)) { resolved = candidate; break }
        }
        if (!resolved) missing.push({ ...entry, importer: relative(file), target: relative(proposedTarget(base)) })
        else if (/\.(md|markdown|txt|json|json5)$/.test(resolved)) {
          const content = await readFile(resolved, 'utf8')
          if (content.startsWith('<!-- @generated stub from scan-missing-imports -->') || /^\s*\{\s*"__stubMissing"\s*:\s*true\s*\}\s*$/.test(content)) unauditedStubs.add(relative(resolved))
        }
      }
    }
  }
  missing.sort((a, b) => a.target.localeCompare(b.target) || a.importer.localeCompare(b.importer))
  return { scannedFiles, missing, unauditedStubs: [...unauditedStubs].sort() }
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  let root = path.resolve(import.meta.dir, '../..')
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--check' || arg === '--dry-run') continue
    if (arg === '--root' && args[i + 1]) root = path.resolve(args[++i]!)
    else throw new Error(`Unknown or incomplete option: ${arg}`)
  }
  const report = await scanMissingImports(root)
  console.log(`[scan] scanned ${report.scannedFiles} source files; ${report.missing.length} unresolved imports`)
  for (const item of report.missing) console.log(`[scan] ERROR ${item.kind}: ${item.importer} -> ${item.specifier} (${item.target}); restore source/contract; no stub authorized`)
  console.log(`[scan] ${report.unauditedStubs.length} existing generated stubs remain unaudited; no files written`)
  if (report.missing.length) process.exitCode = 1
}
