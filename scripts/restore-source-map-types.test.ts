import { describe, expect, it } from 'bun:test'
import ts from 'typescript'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { applySourceMapTypeRecovery, planSourceMapTypeRecovery } from './restore-source-map-types.js'

function mapped(current: string, original: string, source = 'fixture.tsx') {
  const map = Buffer.from(JSON.stringify({ version: 3, sources: [source], sourcesContent: [original], names: [], mappings: '' })).toString('base64')
  return `${current}\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,${map}\n`
}

function plan(current: string, original: string) {
  return planSourceMapTypeRecovery('fixture.tsx', mapped(current, original))
}

describe('source map type recovery', () => {
  it('grafts only missing signatures and preserves changed bodies and compiler caches byte for byte', () => {
    const original = 'type Props = { count: number }; export function Widget({ count }: Props): number { return count }'
    const current = 'type Props = { count: number }; export function Widget(t0) { const $ = cache(7); return t0.count + 100 }'
    const result = plan(current, original)
    expect(result.updatedText).toStartWith('type Props = { count: number }; export function Widget(t0: Props): number { const $ = cache(7); return t0.count + 100 }')
    expect(result.edits.every(edit => edit.start === edit.end)).toBe(true)
    expect(result.updatedText.slice(result.updatedText.indexOf('//# sourceMappingURL'))).toBe(result.originalText.slice(result.originalText.indexOf('//# sourceMappingURL')))
  })

  it('matches duplicate function names only within the same named lexical scope', () => {
    const result = plan('function Left() { function pick(x) { return x + 9 } } function Right() { function pick(x) { return x } }',
      'function Left() { function pick(x: number): number { return x } } function Right() { function pick(x: string): string { return x } }')
    expect(result.updatedText).toContain('function Left() { function pick(x: number): number { return x + 9 }')
    expect(result.updatedText).toContain('function Right() { function pick(x: string): string { return x }')
  })

  it('restores generic selectors so invalid selector fields and assignments are rejected', () => {
    const shared = 'type State = { count: number }; const state: State = { count: 1 }; '
    const result = plan(shared + 'export function select(selector) { const cache = 4; return selector(state) }',
      shared + 'export function select<S>(selector: (state: State) => S): S { return selector(state) }')
    expect(result.updatedText).toContain('select<S>(selector: (state: State) => S): S')
    const source = result.updatedText + '\nconst wrong: string = select(s => s.count); select(s => s.missing)'
    const options: ts.CompilerOptions = { noEmit: true, noLib: true, strictNullChecks: true, noImplicitAny: false, jsx: ts.JsxEmit.Preserve }
    const host = ts.createCompilerHost(options)
    host.getSourceFile = name => name === 'fixture.tsx' ? ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX) : undefined
    const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram(['fixture.tsx'], options, host))
    expect(diagnostics.filter(item => item.file).map(item => item.code).sort()).toEqual([2322, 2339])
  })

  it('recovers bound call arguments and class property types without changing call arguments or initializers', () => {
    const shared = 'declare function useState<T>(value: T): [T, (value: T) => void]; '
    const result = plan(shared + 'function View() { const [value, setValue] = useState(null); return value } class Pane { count = 99; read(x) { return x + this.count } }',
      shared + 'function View() { const [value, setValue] = useState<string | null>(null); return value } class Pane { count: number = 1; read(x: number): number { return x + this.count } }')
    expect(result.updatedText).toContain('useState<string | null>(null)')
    expect(result.updatedText).toContain('count: number = 99')
    expect(result.updatedText).toContain('read(x: number): number { return x + this.count }')
  })

  it('keeps current annotations, skips renamed type-query references and refuses explicit any', () => {
    const result = plan('function keep(x: boolean): boolean { return x } function renamed(t0) { return t0 } function unsafe(x) { return x }',
      'function keep(x: string): string { return x } function renamed(original: string): typeof original { return original } function unsafe(x: any): any { return x }')
    expect(result.updatedText).toContain('keep(x: boolean): boolean')
    expect(result.updatedText).toContain('renamed(t0: string) { return t0 }')
    expect(result.updatedText).not.toContain('typeof original')
    expect(result.updatedText).not.toContain(': any')
    expect(result.skipped.some(item => item.reason === 'renamed-parameter-reference')).toBe(true)
  })

  it('refuses missing imports, mismatched basenames, ambiguous functions and changed bindings', () => {
    const missingImport = plan('function read(x) { return x }', "import type { Missing } from './missing'; function read(x: Missing): Missing { return x }")
    expect(missingImport.edits).toEqual([])
    expect(missingImport.skipped).toContainEqual({ site: '<file>|FunctionDeclaration:read#1', reason: 'missing-type-import', names: ['Missing'] })
    expect(planSourceMapTypeRecovery('fixture.tsx', mapped('function read(x) {}', 'function read(x: string) {}', 'other.tsx')).edits).toEqual([])
    expect(plan('function read(x) {} function read(x) {}', 'function read(x: string) {}').edits).toEqual([])
    const changed = plan('function View() { const [other, setOther] = useState(null) }', 'function View() { const [value, setValue] = useState<string | null>(null) }')
    expect(changed.edits).toEqual([])
  })
})

it('tracks renamed ancestor bindings and newly restored ancestor generics', () => {
  const renamed = plan("const original = 'global'; function outer(t0) { function inner() { return t0 } }", "const original = 'global'; function outer(original: number) { function inner(): typeof original { return original } }")
  expect(renamed.updatedText).not.toContain('inner(): typeof original')
  expect(renamed.skipped.some(item => item.reason === 'renamed-parameter-reference')).toBe(true)
  const generic = plan('function outer(value) { function inner(next) { return next }; return inner(value) }', 'function outer<T>(value: T): T { function inner(next: T): T { return next }; return inner(value) }')
  expect(generic.updatedText).toContain('inner(next: T): T')
})

it('preserves existing call/property types and handles optional parameters with modified defaults', () => {
  const current = 'function optional(value = 9) { return value } class Pane { value: boolean = false } function View() { const [value, setValue] = useState<number>(2) }'
  const original = 'function optional(value?: number): number | undefined { return value } class Pane { value: string = "old" } function View() { const [value, setValue] = useState<string>("old") }'
  const result = plan(current, original)
  expect(result.updatedText).toContain('optional(value: number = 9): number | undefined')
  expect(result.updatedText).toContain('value: boolean = false')
  expect(result.updatedText).toContain('useState<number>(2)')
})

it('defaults to read-only inventory and rejects stale write plans in temporary fixtures', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'source-map-types-'))
  const file = path.join(root, 'src/fixture.tsx')
  mkdirSync(path.dirname(file))
  const before = mapped('function read(value) { return value + 99 }', 'function read(value: number): number { return value }')
  writeFileSync(file, before)
  try {
    const script = path.join(import.meta.dir, 'restore-source-map-types.ts')
    const inventory = Bun.spawnSync([process.execPath, script, '--root', root, '--json'])
    expect(inventory.exitCode).toBe(0)
    expect(JSON.parse(inventory.stdout.toString()).edits).toBe(2)
    expect(readFileSync(file, 'utf8')).toBe(before)
    const check = Bun.spawnSync([process.execPath, script, '--root', root, '--check'])
    expect(check.exitCode).toBe(1)
    expect(readFileSync(file, 'utf8')).toBe(before)
    const recovery = planSourceMapTypeRecovery(file, before)
    writeFileSync(file, before.replace('+ 99', '+ 100'))
    expect(() => applySourceMapTypeRecovery(recovery)).toThrow('Source changed after recovery plan')
    expect(readFileSync(file, 'utf8')).toContain('+ 100')
    const fresh = planSourceMapTypeRecovery(file, readFileSync(file, 'utf8'))
    applySourceMapTypeRecovery(fresh)
    expect(readFileSync(file, 'utf8')).toContain('read(value: number): number { return value + 100 }')
  } finally { rmSync(root, { recursive: true, force: true }) }
})

it('does not add unresolved inline imports or suppression comments from mapped annotations', () => {
  const imported = plan('function read(value) { return value }', "function read(value: import('./missing').Input) { return value }")
  expect(imported.edits).toEqual([])
  expect(imported.skipped.some(item => item.reason === 'inline-type-import-needs-review')).toBe(true)
  const suppressed = plan('function read(value) { return value }', 'function read(value: { field: /* @ts-ignore */ Missing }) { return value }')
  expect(suppressed.edits).toEqual([])
  expect(suppressed.skipped.some(item => item.reason === 'suppression-comment')).toBe(true)
})

it('keeps class/property identities distinct and skips changed parameter counts', () => {
  const result = plan('class Left { value = "new"; read(input) { return input + this.value } } class Right { value = 8; read(input) { return input + this.value } }', 'class Left { value: string = "old"; read(input: string): string { return input + this.value } } class Right { value: number = 1; read(input: number): number { return input + this.value } }')
  expect(result.updatedText).toContain('class Left { value: string = "new"; read(input: string): string')
  expect(result.updatedText).toContain('class Right { value: number = 8; read(input: number): number')
  const changed = plan('function read(first, second) { return second }', 'function read(first: string): string { return first }')
  expect(changed.edits).toEqual([])
  expect(changed.skipped.some(item => item.reason === 'unmatched')).toBe(true)
})

 it('recovers named memo function expressions and annotated local variables without replacing changed initializers', () => {
  const shared = 'type Props = { value: number }; '
  const result = plan(shared + 'const View = memo(function View(t0) { const labels = []; return t0.value + 99 })', shared + 'const View = memo(function View(props: Props): number { const labels: string[] = []; return props.value })')
  expect(result.updatedText).toContain('function View(t0: Props): number')
  expect(result.updatedText).toContain('const labels: string[] = []')
  expect(result.updatedText).toContain('return t0.value + 99')
})
