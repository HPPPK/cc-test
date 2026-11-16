import type { Question, QuestionOption } from '../../../tools/AskUserQuestionTool/AskUserQuestionTool.js'

export type DisplayQuestion = Question & { question: string; options: QuestionOption[] }
/** Adapt canonical and persisted legacy fields once at the permission-card boundary. */
export function normalizeQuestionForDisplay(value: Question): DisplayQuestion {
  const question = value.prompt ?? value.question
  const options = value.choices ?? value.options
  if (!question || !options) throw new Error('Question requires a prompt and choices for display')
  return { ...value, question, options }
}
