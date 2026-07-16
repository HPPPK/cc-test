import { useMemo, useState } from 'react'
import type { WorkflowGitCheckpoint } from '../../types/session'

type WorkflowGitCheckpointControlsProps = {
  enabled: boolean
  reason?: string
  latestVersion: number | null
  checkpoints: WorkflowGitCheckpoint[]
  loading?: boolean
  busy?: 'create' | 'restore' | null
  error?: string | null
  onCreate: () => void
  onRestore: (checkpointId: string) => void
}

export function WorkflowGitCheckpointControls({
  enabled,
  reason,
  latestVersion,
  checkpoints,
  loading = false,
  busy = null,
  error = null,
  onCreate,
  onRestore,
}: WorkflowGitCheckpointControlsProps) {
  const [selectedCheckpointId, setSelectedCheckpointId] = useState('')
  const selectedId = useMemo(() => {
    if (selectedCheckpointId && checkpoints.some((checkpoint) => checkpoint.id === selectedCheckpointId)) {
      return selectedCheckpointId
    }
    return checkpoints[0]?.id ?? ''
  }, [checkpoints, selectedCheckpointId])
  const disabledReason = !enabled ? reason ?? 'Workflow checkpoints are unavailable for this workspace.' : undefined
  const isBusy = busy !== null
  const createDisabled = isBusy || !enabled
  const restoreDisabled = isBusy || checkpoints.length === 0 || !selectedId

  return (
    <div
      data-testid="workflow-git-checkpoint-controls"
      className="flex max-w-full flex-wrap items-center gap-2 text-[12px]"
      title={disabledReason}
    >
      <button
        type="button"
        onClick={onCreate}
        disabled={createDisabled}
        title={disabledReason}
        className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 font-medium text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-secondary)]/40 hover:bg-[var(--color-surface-container-low)] hover:text-[var(--color-text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="material-symbols-outlined text-[15px]" aria-hidden="true">bookmark</span>
        {busy === 'create' ? '存档中…' : '存档'}
      </button>
      <span
        data-testid="workflow-git-checkpoint-latest"
        className="sr-only"
      >
        {latestVersion ? `最近 v${latestVersion}` : '尚未存储'}
      </span>
      <select
        aria-label="历史版本"
        value={selectedId}
        onChange={(event) => setSelectedCheckpointId(event.target.value)}
        disabled={isBusy || checkpoints.length === 0}
        className="h-8 max-w-[130px] rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-[var(--color-text-secondary)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {checkpoints.length === 0 ? <option value="">历史版本</option> : null}
        {checkpoints.map((checkpoint) => (
          <option key={checkpoint.id} value={checkpoint.id}>
            v{checkpoint.version} · {checkpoint.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => { if (selectedId) onRestore(selectedId) }}
        disabled={restoreDisabled}
        className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 font-medium text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-secondary)]/40 hover:bg-[var(--color-surface-container-low)] hover:text-[var(--color-text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="material-symbols-outlined text-[15px]" aria-hidden="true">history</span>
        {busy === 'restore' ? '回退中…' : '回退'}
      </button>
      {loading ? <span className="text-[var(--color-text-tertiary)]">加载中…</span> : null}
      {disabledReason ? (
        <span className="max-w-[220px] truncate text-[var(--color-text-tertiary)]" title={disabledReason}>
          {disabledReason}
        </span>
      ) : null}
      {error ? (
        <span className="max-w-[180px] truncate text-[var(--color-error)]" title={error}>
          {error}
        </span>
      ) : null}
    </div>
  )
}
