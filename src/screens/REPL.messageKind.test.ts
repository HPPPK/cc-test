import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const source = ts.createSourceFile('REPL.tsx', readFileSync(new URL('./REPL.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const calls: ts.CallExpression[] = []
function visit(node: ts.Node) {
  if (ts.isCallExpression(node)) calls.push(node)
  ts.forEachChild(node, visit)
}
visit(source)

function kind(node: ts.Node | undefined) {
  if (!node || !ts.isObjectLiteralExpression(node)) return undefined
  return node.properties.find(property => ts.isPropertyAssignment(property) && property.name.getText(source) === 'messageKind')?.getText(source)
}

describe('REPL producer provenance contract', () => {
  test('requires explicit identity at mixed human and generated constructor boundaries', () => {
    for (const call of calls.filter(call => call.expression.getText(source) === 'createUserMessage')) {
      expect(kind(call.arguments[0])).toBeDefined()
    }
  })

  test('marks both running and idle local-agent followup paths human', () => {
    const queue = calls.find(call => call.expression.getText(source) === 'queuePendingMessage')
    expect(kind(queue?.arguments[3])).toContain("'user_input'")
    const resume = calls.find(call => call.expression.getText(source) === 'resumeAgentBackground')
    expect(kind(resume?.arguments[0])).toContain("'user_input'")
  })

  test('retains the human identity of immediate slash command input', () => {
    const input = calls.find(call => call.expression.getText(source) === 'createCommandInputMessage' && call.arguments[0] && ts.isCallExpression(call.arguments[0]) && call.arguments[0].expression.getText(source) === 'formatCommandInputTags')
    expect(input).toBeDefined()
    expect(input && ts.isSpreadAssignment(input.parent)).toBe(true)
    expect(kind(input?.parent.parent)).toContain("'user_input'")
  })
})
