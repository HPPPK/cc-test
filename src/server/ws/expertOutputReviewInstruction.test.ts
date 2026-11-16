import { readFileSync } from 'node:fs'
import { expect, test } from 'bun:test'

test('output-review continuation delegates original provenance verification without broadening parent reads', () => {
  const source = readFileSync(new URL('./handler.ts', import.meta.url), 'utf8')
  const instruction = source.slice(source.indexOf('function buildOutputReviewAutoContinueInstruction('), source.indexOf('export function buildFinalizeDeliveryAutoContinueInstruction('))
  expect(instruction).toContain('independently verify original captured source text')
  expect(instruction).toContain('exact declared researcher reports/parts, evidence review and browser audit')
  expect(instruction).toContain('The parent must not read raw researcher ledgers')
  expect(instruction).not.toContain('Read exactly ')
})
