import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { createRuntimeUserMessage } from './messages.js'

// Finite inventory of user-role transport producers with a runtime default.
// Mixed sources must pass explicit provenance at their actual human boundaries.
const runtimeProducers = [
  'src/query.ts',
  'src/query/stopHooks.ts',
  'src/services/MagicDocs/magicDocs.ts',
  'src/services/autoDream/autoDream.ts',
  'src/services/api/claude.ts',
  'src/services/SessionMemory/sessionMemory.ts',
  'src/services/awaySummary.ts',
  'src/services/PromptSuggestion/speculation.ts',
  'src/services/PromptSuggestion/promptSuggestion.ts',
  'src/services/extractMemories/extractMemories.ts',
  'src/services/tools/toolExecution.ts',
  'src/services/tools/StreamingToolExecutor.ts',
  'src/services/compact/compact.ts',
  'src/services/compact/sessionMemoryCompact.ts',
  'src/services/compact/workflowSummaryCarryover.ts',
  'src/services/AgentSummary/agentSummary.ts',
  'src/tools/FileReadTool/FileReadTool.ts',
  'src/tools/WebSearchTool/WebSearchTool.ts',
  'src/tools/SkillTool/SkillTool.ts',
  'src/tools/AgentTool/forkSubagent.ts',
  'src/tools/AgentTool/resumeAgent.ts',
  'src/tools/AgentTool/AgentTool.tsx',
  'src/tools/AgentTool/runAgent.ts',
  'src/utils/conversationRecovery.ts',
  'src/utils/forkedAgent.ts',
  'src/utils/teleport.tsx',
  'src/utils/swarm/inProcessRunner.ts',
  'src/utils/hooks/execPromptHook.ts',
  'src/utils/hooks/skillImprovement.ts',
  'src/utils/hooks/execAgentHook.ts',
  'src/utils/api.ts',
  'src/components/agents/generateAgent.ts',
]

function parse(path: string) {
  return ts.createSourceFile(path, readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
}

function constructorCalls(source: ts.SourceFile, name: string) {
  const calls: ts.CallExpression[] = []
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === name) calls.push(node)
    ts.forEachChild(node, visit)
  }
  visit(source)
  return calls
}

describe('runtime-default message producer contract', () => {
  for (const path of runtimeProducers) {
    test(`${path} uses the runtime factory at user-role boundaries`, () => {
      const source = parse(path)
      const imports = source.statements.filter(ts.isImportDeclaration).flatMap(statement => {
        const bindings = statement.importClause?.namedBindings
        return bindings && ts.isNamedImports(bindings) ? bindings.elements.map(element => element.propertyName?.text ?? element.name.text) : []
      })
      expect(imports).toContain('createRuntimeUserMessage')
      expect(imports).not.toContain('createUserMessage')
      expect(constructorCalls(source, 'createRuntimeUserMessage').length).toBeGreaterThan(0)
      expect(constructorCalls(source, 'createUserMessage')).toHaveLength(0)
    })
  }

  test('side questions keep generated instructions separate from actual human input', () => {
    const source = parse('src/utils/sideQuestion.ts')
    expect(constructorCalls(source, 'createRuntimeUserMessage')).toHaveLength(1)
    const human = constructorCalls(source, 'createUserMessage')
    expect(human).toHaveLength(1)
    expect(human[0]?.arguments[0]?.getText(source)).toContain("messageKind: 'user_input'")
    expect(human[0]?.arguments[0]?.getText(source)).toContain('content: question')
  })

  test('main startup keeps both actual human prompt constructors explicit', () => {
    const source = parse('src/main.tsx')
    const calls = constructorCalls(source, 'createUserMessage')
    expect(calls).toHaveLength(2)
    for (const call of calls) {
      const input = call.arguments[0]
      expect(input && ts.isObjectLiteralExpression(input)).toBe(true)
      const property = (input as ts.ObjectLiteralExpression).properties.find(property => ts.isPropertyAssignment(property) && property.name.getText(source) === 'messageKind')
      expect(property?.getText(source)).toContain("'user_input'")
    }
  })
})

describe('runtime factory preserves stronger provenance', () => {
  test('never promotes ordinary generated prose to human input', () => {
    expect(createRuntimeUserMessage({ content: 'hello' }).messageKind).toBe('internal_notification')
    expect(createRuntimeUserMessage({ content: 'Task completed' }).messageKind).toBe('internal_notification')
  })

  test('retains summary, tool exchange, explicit human identity, and independent flags', () => {
    expect(createRuntimeUserMessage({ content: 'summary', isCompactSummary: true }).messageKind).toBe('context_summary')
    expect(createRuntimeUserMessage({ content: [{ type: 'tool_result', tool_use_id: 'fixture-tool', content: 'result' }] }).messageKind).toBe('tool_exchange')
    expect(createRuntimeUserMessage({ content: 'typed', messageKind: 'user_input', isMeta: true, isSynthetic: true })).toMatchObject({ messageKind: 'user_input', isMeta: true, isSynthetic: true })
    expect(createRuntimeUserMessage({ content: 'status', messageKind: 'system_event', isVisibleInTranscriptOnly: true })).toMatchObject({ messageKind: 'system_event', isVisibleInTranscriptOnly: true })
  })
})
