import { describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import ts from 'typescript'
import { spawnSync } from 'node:child_process'

const root = path.resolve(__dirname, '../..')

describe('build global declarations', () => {
  it('matches the real Bun text loader output', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'bun-text-loader-'))
    try {
      await writeFile(path.join(dir, 'instructions.md'), '# Markdown\n')
      await writeFile(path.join(dir, 'instructions.txt'), 'Plain text\n')
      const entry = path.join(dir, 'entry.ts')
      const output = path.join(dir, 'output.js')
      await writeFile(entry, `import md from './instructions.md' with { type: 'text' }
import txt from './instructions.txt' with { type: 'text' }
console.log(JSON.stringify([md, txt]))`)
      const build = spawnSync('bun', ['build', entry, '--target', 'bun', '--outfile', output], { cwd: dir })
      expect(build.status, build.stderr?.toString()).toBe(0)
      const run = spawnSync('bun', [output], { cwd: dir })
      expect(run.status, run.stderr?.toString()).toBe(0)
      expect(JSON.parse(run.stdout.toString())).toEqual(['# Markdown\n', 'Plain text\n'])
    } finally { await rm(dir, { recursive: true, force: true }) }
  })

  it('types the actual preload keys and Bun text imports, while rejecting unknown contracts', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'build-globals-'))
    try {
      const fixture = path.join(dir, 'fixture.ts')
      await writeFile(fixture, `import markdown from './instructions.md' with { type: 'text' }
import text from './instructions.txt' with { type: 'text' }
const strings: string[] = [MACRO.VERSION, MACRO.PACKAGE_URL, MACRO.NATIVE_PACKAGE_URL,
  MACRO.BUILD_TIME, MACRO.FEEDBACK_CHANNEL, MACRO.VERSION_CHANGELOG, MACRO.ISSUES_EXPLAINER,
  markdown, text]
// @ts-expect-error unknown build global keys must fail
MACRO.UNKNOWN_BUILD_KEY
// @ts-expect-error text assets are strings
const number: number = markdown
// @ts-expect-error unrelated missing module must fail
import missing from './missing-runtime.js'
export { strings }
`)
      const program = ts.createProgram([fixture, path.join(root, 'src/build-globals.d.ts')], {
        noEmit: true, strict: true, skipLibCheck: true, types: [],
        module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
        target: ts.ScriptTarget.ESNext,
      })
      const diagnostics = ts.getPreEmitDiagnostics(program)
      expect(diagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n'))).toEqual([])
    } finally { await rm(dir, { recursive: true, force: true }) }
  })

  it('keeps the declared keys equal to the real preload object', async () => {
    const source = ts.createSourceFile('preload.ts', await readFile(path.join(root, 'preload.ts'), 'utf8'), ts.ScriptTarget.Latest, true)
    const actual: string[] = []
    function visit(node: ts.Node) {
      if (ts.isPropertyAssignment(node) && node.name.getText(source) === 'MACRO' && ts.isObjectLiteralExpression(node.initializer)) {
        for (const property of node.initializer.properties) if (property.name) actual.push(property.name.getText(source))
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
    const declaration = await readFile(path.join(root, 'src/build-globals.d.ts'), 'utf8')
    expect([...declaration.matchAll(/readonly ([A-Z_]+): string/g)].map(match => match[1]).sort()).toEqual(actual.sort())
  })
})
