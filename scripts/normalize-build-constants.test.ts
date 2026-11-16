import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { normalizeBuildConstants } from './normalize-build-constants'

test('folds substituted build constants without changing comparisons or touching dynamic values', () => {
  for (const left of ['external', 'ant']) for (const right of ['external', 'ant']) {
    expect(normalizeBuildConstants(`'${left}' === '${right}'`)).toBe(String(left === right))
    expect(normalizeBuildConstants(`'${left}' !== '${right}'`)).toBe(String(left !== right))
  }
  expect(normalizeBuildConstants(`'production' === 'test'`)).toBe('false')
  expect(normalizeBuildConstants(`'production' !== 'development'`)).toBe('true')
  const dynamic = `environment === 'test'; value === 'ant'; const text = "'external' === 'ant'"`
  expect(normalizeBuildConstants(dynamic)).toBe(dynamic)
})

test('keeps disabled internal branch removable by the actual bundler', async () => {
  const source = normalizeBuildConstants(`if ('external' === 'ant') console.log('INTERNAL_SENTINEL');console.log('PUBLIC_SENTINEL')`)
  const directory = await mkdtemp(join(tmpdir(), 'cc-build-fold-'))
  try {
    const entry = join(directory, 'entry.ts')
    await Bun.write(entry, source)
    const result = await Bun.build({ entrypoints: [entry], target: 'bun', minify: true })
    expect(result.success).toBe(true)
    const output = await result.outputs[0]!.text()
    expect(output).not.toContain('INTERNAL_SENTINEL')
    expect(output).toContain('PUBLIC_SENTINEL')
  } finally { await rm(directory, { recursive: true, force: true }) }

})
