import { randomUUID } from 'node:crypto'

type Stage = 'metadata' | 'queueWait' | 'stateRead' | 'reconcile' | 'serialization'
type TimingRecord = { requestId: string; outcome: 'ok' | 'error'; totalMs: number; stagesMs: Record<Stage, number> }

/** Opt-in or slow-request diagnostics. Never log state, content, paths or errors. */
export class WorkflowStateReadTiming {
  private readonly started: number
  private readonly stages: Record<Stage, number> = { metadata: 0, queueWait: 0, stateRead: 0, reconcile: 0, serialization: 0 }
  private finished = false
  constructor(private readonly options: { enabled?: boolean; now?: () => number; log?: (record: TimingRecord) => void } = {}) {
    this.started = this.now()
  }
  private now() { return this.options.now?.() ?? performance.now() }
  begin(stage: Stage): () => void {
    const start = this.now()
    return () => { this.stages[stage] += this.now() - start }
  }
  async measure<T>(stage: Stage, action: () => Promise<T>): Promise<T> {
    const end = this.begin(stage)
    try { return await action() } finally { end() }
  }
  measureSync<T>(stage: Stage, action: () => T): T {
    const end = this.begin(stage)
    try { return action() } finally { end() }
  }
  finish(outcome: TimingRecord['outcome']): void {
    if (this.finished) return
    this.finished = true
    const total = this.now() - this.started
    if (!(this.options.enabled ?? /^(?:1|true)$/i.test(process.env.CC_JIANGXIA_WORKFLOW_STATE_TIMING ?? '')) && total < 1000) return
    const rounded = (value: number) => Math.round(value * 10) / 10
    const record: TimingRecord = { requestId: randomUUID(), outcome, totalMs: rounded(total),
      stagesMs: Object.fromEntries(Object.entries(this.stages).map(([key, value]) => [key, rounded(value)])) as Record<Stage, number> }
    if (this.options.log) this.options.log(record)
    else console.info('[WorkflowStateReadTiming]', JSON.stringify(record))
  }
}
