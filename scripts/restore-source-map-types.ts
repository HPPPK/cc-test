#!/usr/bin/env bun
/** Recover erased annotations from validated inline sourcesContent; bodies are never printed or rewritten. */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

type Signature = ts.FunctionDeclaration | ts.FunctionExpression | ts.MethodDeclaration | ts.GetAccessorDeclaration | ts.SetAccessorDeclaration
type Site = { key: string; node: ts.Node; kind: 'signature'; signature: Signature }
  | { key: string; node: ts.Node; kind: 'call'; call: ts.CallExpression }
  | { key: string; node: ts.Node; kind: 'property'; property: ts.PropertyDeclaration }
  | { key: string; node: ts.Node; kind: 'variable'; variable: ts.VariableDeclaration }
export type RecoveryEdit = { start: number; end: number; text: string; site: string; kind: Site['kind'] }
export type RecoverySkip = { site: string; reason: string; names?: string[] }
export type RecoveryPlan = {
  file: string
  originalText: string
  updatedText: string
  edits: RecoveryEdit[]
  skipped: RecoverySkip[]
  candidateSites: number
  sourceName?: string
}

function bindingNames(name: ts.BindingName): string[] {
  if (ts.isIdentifier(name)) return [name.text]
  return name.elements.flatMap(item => ts.isOmittedExpression(item) ? [] : bindingNames(item.name))
}
function literalName(name: ts.PropertyName | ts.BindingName | undefined): string | undefined {
  return name && (ts.isIdentifier(name) || ts.isPrivateIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) ? name.text : undefined
}
function functionScopeName(node: ts.Node): string | undefined {
  if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) return node.name?.text
  if (ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) return literalName(node.name)
  if (ts.isArrowFunction(node) && ts.isVariableDeclaration(node.parent)) return literalName(node.parent.name)
  return undefined
}
function scopeKey(node: ts.Node): string | undefined {
  const scopes: string[] = []
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (ts.isFunctionLike(parent)) {
      const name = functionScopeName(parent)
      if (!name) return undefined
      scopes.push('function:' + name)
    } else if (ts.isClassDeclaration(parent) || ts.isClassExpression(parent)) {
      if (!parent.name) return undefined
      scopes.push('class:' + parent.name.text)
    } else if (ts.isModuleDeclaration(parent)) {
      scopes.push('module:' + parent.name.text)
    } else if (ts.isBlock(parent) && !(ts.isFunctionLike(parent.parent) && 'body' in parent.parent && parent.parent.body === parent)) {
      // Anonymous lexical blocks have no stable identity after compiler rewrites.
      return undefined
    }
  }
  return scopes.reverse().join('/') || '<file>'
}
function calleeName(expression: ts.Expression): string | undefined {
  if (ts.isIdentifier(expression)) return expression.text
  if (ts.isPropertyAccessExpression(expression) && !expression.questionDotToken) {
    const owner = calleeName(expression.expression)
    return owner ? owner + '.' + expression.name.text : undefined
  }
  return undefined
}
function sites(source: ts.SourceFile): Map<string, Site[]> {
  const result = new Map<string, Site[]>()
  function add(site: Site) { result.set(site.key, [...(result.get(site.key) ?? []), site]) }
  function visit(node: ts.Node) {
    const scope = scopeKey(node)
    if (scope !== undefined) {
      if (((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) && node.name) || ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) {
        const signature = node as Signature
        const name = literalName(signature.name)
        if (name) add({ key: `${scope}|${ts.SyntaxKind[node.kind]}:${name}#${signature.parameters.length}`, node, kind: 'signature', signature })
      } else if (ts.isVariableDeclaration(node) && node.initializer && ts.isCallExpression(node.initializer)) {
        const call = node.initializer
        const callee = calleeName(call.expression)
        if (callee && !call.questionDotToken) add({ key: `${scope}|call:${callee}|bindings:${bindingNames(node.name).join(',')}`, node, kind: 'call', call })
      } else if (ts.isPropertyDeclaration(node) && (ts.isClassDeclaration(node.parent) || ts.isClassExpression(node.parent))) {
        const name = literalName(node.name)
        if (name) add({ key: `${scope}|property:${name}`, node, kind: 'property', property: node })
      }
    }
    if (scope !== undefined && ts.isVariableDeclaration(node)) {
      add({ key: `${scope}|variable:${bindingNames(node.name).join(',')}`, node, kind: 'variable', variable: node })
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return result
}
function declaredNames(node: ts.Node, names: Set<string>) {
  if (ts.isVariableStatement(node)) for (const declaration of node.declarationList.declarations) bindingNames(declaration.name).forEach(name => names.add(name))
  else if (ts.isImportDeclaration(node)) {
    if (node.importClause?.name) names.add(node.importClause.name.text)
    const bindings = node.importClause?.namedBindings
    if (bindings && ts.isNamespaceImport(bindings)) names.add(bindings.name.text)
    else if (bindings && ts.isNamedImports(bindings)) bindings.elements.forEach(item => names.add(item.name.text))
  } else if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isEnumDeclaration(node) || ts.isModuleDeclaration(node)) && node.name) names.add(node.name.text)
  else if (ts.isImportEqualsDeclaration(node)) names.add(node.name.text)
}
let libraryNames: Set<string> | undefined
function ambientNames(): Set<string> {
  if (libraryNames) return libraryNames
  libraryNames = new Set(['Bun', 'NodeJS', 'Buffer', 'global', 'globalThis'])
  const directory = path.dirname(ts.getDefaultLibFilePath({ target: ts.ScriptTarget.ESNext }))
  for (const file of readdirSync(directory).filter(name => /^lib\..*\.d\.ts$/.test(name))) {
    const source = ts.createSourceFile(file, readFileSync(path.join(directory, file), 'utf8'), ts.ScriptTarget.Latest, true)
    source.statements.forEach(node => declaredNames(node, libraryNames!))
  }
  return libraryNames
}
function availableNames(node: ts.Node): Set<string> {
  const names = new Set(ambientNames())
  for (let scope: ts.Node | undefined = node; scope; scope = scope.parent) {
    if (ts.isSourceFile(scope) || ts.isBlock(scope) || ts.isModuleBlock(scope)) scope.statements.forEach(statement => declaredNames(statement, names))
    if (ts.isFunctionLike(scope)) {
      scope.typeParameters?.forEach(parameter => names.add(parameter.name.text))
      scope.parameters.forEach(parameter => bindingNames(parameter.name).forEach(name => names.add(name)))
    }
    if (ts.isClassDeclaration(scope) || ts.isClassExpression(scope)) {
      if (scope.name) names.add(scope.name.text)
      scope.typeParameters?.forEach(parameter => names.add(parameter.name.text))
    }
  }
  return names
}
function parseErrors(source: ts.SourceFile): boolean {
  const diagnostics: unknown = Reflect.get(source, 'parseDiagnostics')
  return Array.isArray(diagnostics) && diagnostics.length > 0
}
function rootName(name: ts.EntityName): string {
  return ts.isIdentifier(name) ? name.text : rootName(name.left)
}
function hasOriginalTypes(site: Site) {
  if (site.kind === 'call') return !!site.call.typeArguments?.length
  if (site.kind === 'property') return !!site.property.type
  if (site.kind === 'variable') return !!site.variable.type
  return !!site.signature.typeParameters?.length || !!site.signature.type || site.signature.parameters.some(parameter => parameter.type || parameter.questionToken)
}

export function planSourceMapTypeRecovery(file: string, currentText: string): RecoveryPlan {
  const plan: RecoveryPlan = { file, originalText: currentText, updatedText: currentText, edits: [], skipped: [], candidateSites: 0 }
  const skip = (site: string, reason: string, names?: string[]) => plan.skipped.push({ site, reason, ...(names?.length ? { names } : {}) })
  const maps = [...currentText.matchAll(/^\s*\/\/# sourceMappingURL=data:application\/json(?:;[^,\r\n]*)?;base64,([A-Za-z0-9+/=]+)\s*$/gm)]
  if (!maps.length) return plan
  if (maps.length !== 1) { skip('<file>', 'ambiguous-source-map'); return plan }
  let raw: unknown
  try {
    const encoded = maps[0]![1]!
    const decoded = Buffer.from(encoded, 'base64')
    if (decoded.toString('base64').replace(/=+$/, '') !== encoded.replace(/=+$/, '')) throw new Error('Invalid base64')
    raw = JSON.parse(decoded.toString('utf8'))
  } catch { skip('<file>', 'invalid-source-map'); return plan }
  if (!raw || typeof raw !== 'object' || !('version' in raw) || raw.version !== 3 || !('sources' in raw) || !Array.isArray(raw.sources) || !('sourcesContent' in raw) || !Array.isArray(raw.sourcesContent) || raw.sources.length !== raw.sourcesContent.length) {
    skip('<file>', 'invalid-source-map'); return plan
  }
  const basename = path.basename(file)
  const sourceBasename = (name: string) => path.posix.basename(name.replaceAll('\\', '/'))
  if ('file' in raw && (typeof raw.file !== 'string' || sourceBasename(raw.file) !== basename)) { skip('<file>', 'source-map-basename-mismatch'); return plan }
  const matches = raw.sources.flatMap((name: unknown, index: number) => typeof name === 'string' && sourceBasename(name) === basename && typeof raw.sourcesContent[index] === 'string' ? [{ name, content: raw.sourcesContent[index] as string }] : [])
  if (matches.length !== 1) { skip('<file>', 'source-map-basename-mismatch'); return plan }
  const original = ts.createSourceFile(basename, matches[0]!.content, ts.ScriptTarget.Latest, true)
  const current = ts.createSourceFile(basename, currentText, ts.ScriptTarget.Latest, true)
  plan.sourceName = matches[0]!.name
  if (parseErrors(original) || parseErrors(current)) { skip('<file>', 'parse-error'); return plan }
  const previousSites = sites(original)
  const currentSites = sites(current)
  const renamedScopes = new Map<ts.Node, Set<string>>()
  const plannedGenerics = new Map<ts.Node, Set<string>>()
  for (const [key, entries] of previousSites) {
    const targets = currentSites.get(key) ?? []
    if (entries.length !== 1 || targets.length !== 1) continue
    const before = entries[0]!
    const after = targets[0]!
    if (before.kind !== 'signature' || after.kind !== 'signature') continue
    const changed = new Set<string>()
    before.signature.parameters.forEach((parameter, index) => {
      const next = new Set(bindingNames(after.signature.parameters[index]!.name))
      bindingNames(parameter.name).filter(name => !next.has(name)).forEach(name => changed.add(name))
    })
    renamedScopes.set(after.node, changed)
  }
  function ancestorNames(node: ts.Node, map: Map<ts.Node, Set<string>>): Set<string> {
    const names = new Set<string>()
    for (let current: ts.Node | undefined = node; current; current = current.parent) map.get(current)?.forEach(name => names.add(name))
    return names
  }
  const originalImports = new Set<string>()
  original.statements.filter(ts.isImportDeclaration).forEach(node => declaredNames(node, originalImports))
  function safe(nodes: readonly ts.Node[], site: string, available: Set<string>, renamed: Set<string>): boolean {
    let hasAny = false
    const references = new Set<string>()
    const local = new Set<string>()
    let changedReference = false
    let inlineImport = false
    const hasSuppression = nodes.some(node => /@ts-(?:ignore|nocheck|expect-error)\b/.test(node.getText(original)))
    function visit(node: ts.Node) {
      if (node.kind === ts.SyntaxKind.AnyKeyword) hasAny = true
      if (ts.isImportTypeNode(node)) inlineImport = true
      if (ts.isTypeParameterDeclaration(node)) local.add(node.name.text)
      if (ts.isTypeReferenceNode(node)) references.add(rootName(node.typeName))
      if (ts.isTypeQueryNode(node) && (ts.isIdentifier(node.exprName) || ts.isQualifiedName(node.exprName))) {
        const name = rootName(node.exprName)
        references.add(name)
        if (renamed.has(name)) changedReference = true
      }
      if (ts.isTypePredicateNode(node) && ts.isIdentifier(node.parameterName) && renamed.has(node.parameterName.text)) changedReference = true
      ts.forEachChild(node, visit)
    }
    nodes.forEach(visit)
    if (hasAny) { skip(site, 'explicit-any'); return false }
    if (hasSuppression) { skip(site, 'suppression-comment'); return false }
    if (inlineImport) { skip(site, 'inline-type-import-needs-review'); return false }
    if (changedReference) { skip(site, 'renamed-parameter-reference'); return false }
    const missing = [...references].filter(name => !available.has(name) && !local.has(name)).sort()
    if (missing.length) { skip(site, missing.some(name => originalImports.has(name)) ? 'missing-type-import' : 'missing-type-declaration', missing); return false }
    return true
  }
  function add(position: number, text: string, site: Site) { plan.edits.push({ start: position, end: position, text, site: site.key, kind: site.kind }) }
  for (const [key, originals] of previousSites) {
    if (!originals.some(hasOriginalTypes)) continue
    plan.candidateSites++
    const targets = currentSites.get(key) ?? []
    if (originals.length !== 1 || targets.length > 1) { skip(key, 'ambiguous-match'); continue }
    if (!targets.length) { skip(key, 'unmatched'); continue }
    const previous = originals[0]!
    const target = targets[0]!
    const available = new Set([...availableNames(target.node), ...ancestorNames(target.node, plannedGenerics)])
    const renamedAncestors = ancestorNames(target.node, renamedScopes)
    if (previous.kind === 'call' && target.kind === 'call') {
      if (target.call.typeArguments?.length || !previous.call.typeArguments?.length) continue
      if (safe(previous.call.typeArguments, key, available, renamedAncestors)) add(target.call.expression.end, '<' + previous.call.typeArguments.map(node => node.getText(original)).join(', ') + '>', target)
    } else if (previous.kind === 'property' && target.kind === 'property') {
      if (target.property.type || !previous.property.type) continue
      if (safe([previous.property.type], key, available, renamedAncestors)) {
        const anchor = target.property.questionToken?.end ?? target.property.exclamationToken?.end ?? target.property.name.end
        add(anchor, ': ' + previous.property.type.getText(original), target)
      }
    } else if (previous.kind === 'variable' && target.kind === 'variable') {
      if (!target.variable.type && previous.variable.type && safe([previous.variable.type], key, available, renamedAncestors)) {
        add(target.variable.name.end, ': ' + previous.variable.type.getText(original), target)
      }
    } else if (previous.kind === 'signature' && target.kind === 'signature') {
      const before = previous.signature
      const after = target.signature
      if (before.parameters.some((parameter, index) => !!parameter.dotDotDotToken !== !!after.parameters[index]?.dotDotDotToken)) { skip(key, 'rest-parameter-mismatch'); continue }
      const renamed = new Set(renamedAncestors)
      before.parameters.forEach((parameter, index) => {
        const next = new Set(bindingNames(after.parameters[index]!.name))
        bindingNames(parameter.name).filter(name => !next.has(name)).forEach(name => renamed.add(name))
      })
      const oldGenerics = before.typeParameters?.map(parameter => parameter.name.text) ?? []
      const newGenerics = after.typeParameters?.map(parameter => parameter.name.text) ?? []
      if (newGenerics.length && oldGenerics.join(',') !== newGenerics.join(',')) { skip(key, 'existing-generics-differ'); continue }
      if (oldGenerics.length && !newGenerics.length && before.typeParameters) {
        const genericAvailable = new Set([...available, ...oldGenerics])
        if (safe(before.typeParameters, key, genericAvailable, renamed)) {
          add(after.name!.end, '<' + before.typeParameters.map(parameter => parameter.getText(original)).join(', ') + '>', target)
          oldGenerics.forEach(name => available.add(name))
          plannedGenerics.set(after, new Set(oldGenerics))
        }
      }
      before.parameters.forEach((parameter, index) => {
        const next = after.parameters[index]!
        const optional = !!parameter.questionToken && !next.questionToken && !next.initializer && !next.dotDotDotToken
        if (!next.type && parameter.type && safe([parameter.type], key, available, renamed)) {
          const anchor = next.questionToken?.end ?? next.name.end
          add(anchor, (optional ? '?' : '') + ': ' + parameter.type.getText(original), target)
        } else if (optional) add(next.name.end, '?', target)
      })
      if (!after.type && before.type && safe([before.type], key, available, renamed)) {
        const close = after.getChildren(current).find(node => node.kind === ts.SyntaxKind.CloseParenToken)
        if (close) add(close.end, ': ' + before.type.getText(original), target)
      }
    }
  }
  for (const edit of [...plan.edits].sort((a, b) => b.start - a.start)) plan.updatedText = plan.updatedText.slice(0, edit.start) + edit.text + plan.updatedText.slice(edit.end)
  if (parseErrors(ts.createSourceFile(basename, plan.updatedText, ts.ScriptTarget.Latest, true))) {
    plan.edits = []
    plan.updatedText = currentText
    skip('<file>', 'recovered-syntax-invalid')
  }
  return plan
}

/** Refuse stale plans rather than overwriting edits made after review. */
export function applySourceMapTypeRecovery(plan: RecoveryPlan): void {
  if (!plan.edits.length) return
  if (readFileSync(plan.file, 'utf8') !== plan.originalText) throw new Error(`Source changed after recovery plan: ${plan.file}`)
  writeFileSync(plan.file, plan.updatedText, 'utf8')
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  let root = process.cwd()
  let write = false
  let check = false
  let json = false
  const excluded: string[] = []
  const requested: string[] = []
  for (let i = 0; i < args.length; i++) {
    const argument = args[i]!
    if (argument === '--write') write = true
    else if (argument === '--dry-run') write = false
    else if (argument === '--check') check = true
    else if (argument === '--json') json = true
    else if ((argument === '--root' || argument === '--exclude') && args[i + 1]) {
      const value = args[++i]!
      if (argument === '--root') root = path.resolve(value)
      else excluded.push(value.replaceAll('\\', '/').replace(/\/$/, ''))
    } else if (argument.startsWith('--')) throw new Error(`Unknown or incomplete option: ${argument}`)
    else requested.push(argument)
  }
  if (write && check) throw new Error('--check cannot be combined with --write')
  function walk(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') return []
      const file = path.join(directory, entry.name)
      return entry.isDirectory() ? walk(file) : /\.[cm]?tsx?$/.test(file) ? [file] : []
    })
  }
  const files = requested.length ? requested.map(file => path.resolve(root, file)) : walk(path.join(root, 'src'))
  const plans = files.filter(file => {
    const relative = path.relative(root, file).split(path.sep).join('/')
    return !excluded.some(item => relative === item || relative.startsWith(item + '/'))
  }).map(file => planSourceMapTypeRecovery(file, readFileSync(file, 'utf8')))
  const mapped = plans.filter(plan => plan.sourceName || plan.skipped.length)
  const edits = plans.reduce((count, plan) => count + plan.edits.length, 0)
  const report = {
    mode: write ? 'write' : 'dry-run', scannedFiles: files.length, mappedFiles: mapped.length,
    candidateSites: plans.reduce((count, plan) => count + plan.candidateSites, 0), edits,
    files: mapped.map(plan => ({ file: path.relative(root, plan.file), sourceName: plan.sourceName, edits: plan.edits, skipped: plan.skipped })),
  }
  if (write) {
    // Validate the entire batch before any write; each individual write checks again.
    for (const plan of plans) if (readFileSync(plan.file, 'utf8') !== plan.originalText) throw new Error(`Source changed after recovery plan: ${plan.file}`)
    plans.forEach(applySourceMapTypeRecovery)
  }
  console.log(json ? JSON.stringify(report, null, 2) : `[type-recovery] ${mapped.length} mapped files; ${report.candidateSites} original sites; ${edits} safe insertions; ${write ? 'written' : 'no files written'}`)
  if (check && edits) process.exitCode = 1
}
