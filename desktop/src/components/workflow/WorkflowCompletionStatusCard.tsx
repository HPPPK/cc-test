import { useMemo, useState, type ReactNode } from 'react'
import type { WorkflowCompletionProgressUpdate } from '../../api/sessions'
import type { WorkflowSessionSummary } from '../../types/session'

type CompletionProgressAction = WorkflowCompletionProgressUpdate extends infer Update
  ? Update extends unknown
    ? Omit<Update, 'actor' | 'rationale'>
    : never
  : never

type Props = {
  workflow: WorkflowSessionSummary
  pending?: boolean
  error?: string | null
  onUpdate: (update: WorkflowCompletionProgressUpdate) => Promise<void> | void
}

function ids(value: string): string[] {
  return [...new Set(value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean))]
}

export function WorkflowCompletionStatusCard({ workflow, pending = false, error, onUpdate }: Props) {
  const completion = workflow.completion
  const [rationale, setRationale] = useState('')
  const [artifactRefs, setArtifactRefs] = useState<Record<string, string>>({})
  const [checkRefs, setCheckRefs] = useState<Record<string, string>>({})
  const [issueFollowUps, setIssueFollowUps] = useState<Record<string, string>>({})

  const submit = async (update: CompletionProgressAction) => {
    const trimmedRationale = rationale.trim()
    if (!trimmedRationale) return
    await onUpdate({ ...update, actor: 'user', rationale: trimmedRationale } as WorkflowCompletionProgressUpdate)
    setRationale('')
  }

  const unresolved = useMemo(
    () => completion?.issues.filter((issue) => issue.blocksCompletion && issue.status !== 'resolved' && issue.status !== 'stale') ?? [],
    [completion],
  )

  if (!completion) return null

  return (
    <section
      data-testid="workflow-completion-status-card"
      className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] px-3 py-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-xs font-semibold text-[var(--color-text-primary)]">阶段完成状态</h3>
          <p className="mt-1 text-[11px] leading-4 text-[var(--color-text-secondary)]">
            仅在所有阻塞事项、产物和检查均实际处理后，runtime 才会向模型开放阶段切换工具。
          </p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${completion.eligibility === 'eligible' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'}`}>
          {completion.eligibility === 'eligible' ? '可提交完成' : '尚不可完成'}
        </span>
      </div>

      {completion.blockerReasons.length ? (
        <ul className="mt-2 space-y-1 rounded-[6px] bg-[var(--color-surface-container)] px-2 py-2 text-[11px] leading-4 text-[var(--color-text-secondary)]">
          {completion.blockerReasons.map((reason) => <li key={reason}>• {reason}</li>)}
        </ul>
      ) : null}

      <label className="mt-3 block text-[11px] font-medium text-[var(--color-text-secondary)]">
        处理说明（必填，记录为审计理由）
        <textarea
          value={rationale}
          onChange={(event) => setRationale(event.target.value)}
          placeholder="说明已核实的工作、证据或问题处理结果"
          className="mt-1 min-h-16 w-full resize-y rounded-[6px] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-[12px] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-brand)]"
        />
      </label>

      <div className="mt-3 flex flex-wrap gap-2">
        {completion.migrationStatus === 'needs-rebuild' ? (
          <ActionButton disabled={pending || !rationale.trim()} onClick={() => void submit({ type: 'rebuild' })}>重建并重新评估</ActionButton>
        ) : null}
        {completion.workStatus !== 'ready-for-review' && completion.workStatus !== 'completed' ? (
          <ActionButton disabled={pending || !rationale.trim()} onClick={() => void submit({ type: 'work-ready-for-review' })}>标记工作已可复核</ActionButton>
        ) : null}
      </div>

      {completion.artifactRequirements.length ? (
        <div className="mt-3 space-y-2">
          <div className="text-[11px] font-semibold text-[var(--color-text-primary)]">必需产物</div>
          {completion.artifactRequirements.map((requirement) => (
            <div key={requirement.id} className="rounded-[6px] border border-[var(--color-border)] px-2 py-2">
              <div className="text-[11px] font-medium text-[var(--color-text-primary)]">{requirement.id}</div>
              {requirement.description ? <div className="mt-0.5 text-[10px] text-[var(--color-text-secondary)]">{requirement.description}</div> : null}
              {requirement.status === 'satisfied' ? (
                <div className="mt-1 text-[10px] text-emerald-700 dark:text-emerald-300">已验证：{requirement.artifactIds.join(', ')}</div>
              ) : (
                <div className="mt-2 flex gap-2">
                  <input
                    value={artifactRefs[requirement.id] ?? ''}
                    onChange={(event) => setArtifactRefs((current) => ({ ...current, [requirement.id]: event.target.value }))}
                    placeholder="artifact ID（首次提交会持久化为阶段证据），可用逗号分隔"
                    className="min-w-0 flex-1 rounded-[5px] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[11px] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-brand)]"
                  />
                  <ActionButton disabled={pending || !rationale.trim() || !ids(artifactRefs[requirement.id] ?? '').length} onClick={() => void submit({ type: 'artifact-satisfied', artifactRequirementId: requirement.id, artifactIds: ids(artifactRefs[requirement.id] ?? '') })}>验证</ActionButton>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : null}

      {completion.checks.length ? (
        <div className="mt-3 space-y-2">
          <div className="text-[11px] font-semibold text-[var(--color-text-primary)]">完成检查</div>
          {completion.checks.map((check) => (
            <div key={check.id} className="rounded-[6px] border border-[var(--color-border)] px-2 py-2">
              <div className="text-[11px] font-medium text-[var(--color-text-primary)]">{check.description ?? check.id}</div>
              {check.status === 'passed' ? (
                <div className="mt-1 text-[10px] text-emerald-700 dark:text-emerald-300">已通过</div>
              ) : (
                <div className="mt-2 flex gap-2">
                  <input
                    value={checkRefs[check.id] ?? ''}
                    onChange={(event) => setCheckRefs((current) => ({ ...current, [check.id]: event.target.value }))}
                    placeholder="支持该检查的 artifact ID"
                    className="min-w-0 flex-1 rounded-[5px] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[11px] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-brand)]"
                  />
                  <ActionButton disabled={pending || !rationale.trim() || !ids(checkRefs[check.id] ?? '').length} onClick={() => void submit({ type: 'check-passed', checkId: check.id, evidenceArtifactIds: ids(checkRefs[check.id] ?? '') })}>记录通过</ActionButton>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : null}

      {unresolved.length ? (
        <div className="mt-3 space-y-2">
          <div className="text-[11px] font-semibold text-[var(--color-text-primary)]">待处理阶段事项</div>
          {unresolved.map((issue) => {
            const followUp = issueFollowUps[issue.id]?.trim()
            return (
              <div key={issue.id} className="rounded-[6px] border border-amber-500/30 bg-amber-500/5 px-2 py-2">
                <div className="text-[11px] font-medium text-[var(--color-text-primary)]">{issue.question ?? issue.blockingReason}</div>
                <div className="mt-0.5 text-[10px] text-[var(--color-text-secondary)]">状态：{issue.status}</div>
                <input
                  value={issueFollowUps[issue.id] ?? ''}
                  onChange={(event) => setIssueFollowUps((current) => ({ ...current, [issue.id]: event.target.value }))}
                  placeholder="可选：后续工作或关联说明"
                  className="mt-2 w-full rounded-[5px] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[11px] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-brand)]"
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  <ActionButton disabled={pending || !rationale.trim()} onClick={() => void submit({ type: 'process-issue', issueId: issue.id, status: 'resolved', ...(followUp ? { followUp } : {}) })}>确认已处理</ActionButton>
                  <ActionButton disabled={pending || !rationale.trim()} onClick={() => void submit({ type: 'process-issue', issueId: issue.id, status: 'needs-clarification', ...(followUp ? { followUp } : {}) })}>需要澄清</ActionButton>
                </div>
              </div>
            )
          })}
        </div>
      ) : null}

      {error ? <p role="alert" className="mt-3 text-[11px] text-[var(--color-error)]">{error}</p> : null}
    </section>
  )
}

function ActionButton({ children, disabled, onClick }: { children: ReactNode; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-[5px] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[11px] font-medium text-[var(--color-text-primary)] transition-colors hover:border-[var(--color-brand)] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  )
}
