import ts from 'typescript'

/** Fold only identity/environment literals already substituted by the public build. */
export function normalizeBuildConstants(source: string, fileName = 'source.ts'): string {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const edits: Array<{ start: number; end: number; value: string }> = []
  function visit(node: ts.Node): void {
    if (ts.isBinaryExpression(node) && ts.isStringLiteral(node.left) && ts.isStringLiteral(node.right)) {
      const left = node.left.text, right = node.right.text
      const audience = [left, right].every(value => ['external', 'ant'].includes(value))
      const environment = [left, right].every(value => ['production', 'development', 'test'].includes(value))
      const operator = node.operatorToken.kind
      if ((audience || environment) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(operator)) {
        const equal = left === right
        edits.push({ start: node.getStart(file), end: node.getEnd(), value: String(operator === ts.SyntaxKind.EqualsEqualsEqualsToken ? equal : !equal) })
        return
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  for (const edit of edits.reverse()) source = source.slice(0, edit.start) + edit.value + source.slice(edit.end)
  return source
}
