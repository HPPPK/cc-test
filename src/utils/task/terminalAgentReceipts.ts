import { getSessionId } from '../../bootstrap/state.js'
import type { LocalAgentTaskState } from '../../tasks/LocalAgentTask/LocalAgentTask.js'

type TerminalAgentReceipt = {
  task_id: string
  task_type: 'local_agent'
  status: string
  description: string
  output: string
  result: string
  error?: string
  toolAudit?: { playwright: number }
}

// Keep only bounded final answers, never task messages, handles, or controllers.
// This is an in-process late-reader cache; it does not restore tasks on resume.
export class TerminalAgentReceiptStore {
  private session: string | undefined
  private receipts = new Map<string, TerminalAgentReceipt>()

  constructor(private sessionId: () => string, private capacity = 100) {}

  private current() {
    const session = this.sessionId()
    if (this.session !== session) {
      this.receipts.clear()
      this.session = session
    }
    return this.receipts
  }

  record(task: LocalAgentTaskState): void {
    if (!['completed', 'failed', 'killed'].includes(task.status)) return
    const receipts = this.current()
    const text = task.result?.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('\n') || task.error || ''
    const output = text.length > 100_000 ? `${text.slice(0, 100_000)}\n[Final answer truncated]` : text
    receipts.delete(task.id)
    receipts.set(task.id, {
      task_id: task.id, task_type: 'local_agent', status: task.status,
      description: task.description.slice(0, 2000), output, result: output,
      ...(task.error ? { error: task.error.slice(0, 10_000) } : {}),
      ...(task.result?.playwrightToolUseCount === undefined ? {} : { toolAudit: { playwright: task.result.playwrightToolUseCount } }),
    })
    while (receipts.size > this.capacity) receipts.delete(receipts.keys().next().value!)
  }

  get(taskId: string): TerminalAgentReceipt | undefined { return this.current().get(taskId) }
  forget(taskId: string): void { this.current().delete(taskId) }
}

export const terminalAgentReceipts = new TerminalAgentReceiptStore(getSessionId)
