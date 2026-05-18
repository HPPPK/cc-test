import { useState } from 'react'
import { useTeamStore } from '../../stores/teamStore'
import { useTabStore } from '../../stores/tabStore'
import { useTranslation } from '../../i18n'
import { ConfirmDialog } from '../shared/ConfirmDialog'
import { formatDuration } from '../../lib/formatDuration'
import { formatCompact } from '../../lib/formatCompact'
import type { TeamMember } from '../../types/team'
import { ApiError } from '../../api/client'

const memberStatusConfig = {
  running: {
    icon: 'pending',
    color: 'var(--color-warning)',
    pulse: true,
  },
  idle: {
    icon: 'radio_button_unchecked',
    color: 'var(--color-text-tertiary)',
    pulse: false,
  },
  completed: {
    icon: 'check_circle',
    color: 'var(--color-success)',
    pulse: false,
  },
  error: {
    icon: 'error',
    color: 'var(--color-error)',
    pulse: false,
  },
} as const

export function TeamStatusBar() {
  const t = useTranslation()
  const { activeTeam, openMemberSession, deleteTeam, wsDisconnected } = useTeamStore()
  const activeTabId = useTabStore((s) => s.activeTabId)
  const [expanded, setExpanded] = useState(true)
  const [showDeleteTeamDialog, setShowDeleteTeamDialog] = useState(false)
  const [showStopTeamDialog, setShowStopTeamDialog] = useState(false)
  const [showForceDeleteDialog, setShowForceDeleteDialog] = useState(false)
  const [deletingTeam, setDeletingTeam] = useState(false)
  const [stoppingTeam, setStoppingTeam] = useState(false)

  // Only show TeamStatusBar if:
  // 1. There's an active team, AND
  // 2. The current session is the team's lead session
  if (!activeTeam) return null
  if (!activeTabId || activeTabId !== activeTeam.leadSessionId) return null

  // Filter out leader — main window is already the leader's view
  const members = activeTeam.members.filter(
    (m) => !activeTeam.leadAgentId || m.agentId !== activeTeam.leadAgentId,
  )
  const runningCount = members.filter((m) => m.status === 'running').length
  const completedCount = members.filter((m) => m.status === 'completed').length
  const totalCount = members.length
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0
  const allDone = runningCount === 0 && totalCount > 0

  const handleDeleteTeamClick = () => {
    if (runningCount > 0) {
      setShowStopTeamDialog(true)
    } else {
      setShowDeleteTeamDialog(true)
    }
  }

  const handleStopAndDeleteTeam = async () => {
    setStoppingTeam(true)
    try {
      await deleteTeam(true)
      setShowStopTeamDialog(false)
    } catch (error) {
      console.error('Failed to stop and delete team:', error)
    } finally {
      setStoppingTeam(false)
    }
  }

  const handleDeleteTeam = async () => {
    setDeletingTeam(true)
    try {
      await deleteTeam()
      setShowDeleteTeamDialog(false)
    } catch (error) {
      // If 409 Conflict, show force delete dialog
      if (error instanceof ApiError && error.status === 409) {
        setShowDeleteTeamDialog(false)
        setShowForceDeleteDialog(true)
      } else {
        console.error('Failed to delete team:', error)
      }
    } finally {
      setDeletingTeam(false)
    }
  }

  const handleForceDeleteTeam = async () => {
    setDeletingTeam(true)
    try {
      await deleteTeam(true)
      setShowForceDeleteDialog(false)
    } catch (error) {
      console.error('Failed to force delete team:', error)
    } finally {
      setDeletingTeam(false)
    }
  }

  return (
    <div className="shrink-0 px-8">
      <div className="mx-auto max-w-[860px] rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)]/40 bg-[var(--color-surface-container-lowest)] overflow-hidden mb-2">
        {/* Header */}
        <div
          onClick={() => setExpanded((v) => !v)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              setExpanded((v) => !v)
            }
          }}
          className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--color-surface-container-low)] transition-colors bg-[var(--color-surface-container)]"
        >
          <div className="flex items-center justify-center w-6 h-6 rounded-[var(--radius-md)] bg-[var(--color-brand)]/10">
            <span className="material-symbols-outlined text-[14px] text-[var(--color-brand)]">groups</span>
          </div>

          <span className="text-xs font-semibold text-[var(--color-text-primary)]">
            {t('teams.team')} {activeTeam.name}
          </span>

          {/* Disconnected indicator */}
          {wsDisconnected && (
            <span className="flex items-center gap-1 text-[10px] text-[var(--color-error)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-error)]" />
              {t('teams.disconnected')}
            </span>
          )}

          {/* Progress bar */}
          <div className="flex-1 h-1.5 rounded-full bg-[var(--color-border)] overflow-hidden max-w-[200px]">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${progressPercent}%`,
                backgroundColor: allDone ? 'var(--color-success)' : 'var(--color-brand)',
              }}
            />
          </div>

          <span className="text-[10px] text-[var(--color-text-tertiary)] tabular-nums">
            {completedCount}/{totalCount}
          </span>

          {runningCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-[var(--color-warning)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-warning)] animate-pulse-dot" />
              {runningCount} {t('teams.running')}
            </span>
          )}

          {/* Delete team button */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleDeleteTeamClick()
            }}
            className="p-1 rounded hover:bg-[var(--color-surface-container-high)] transition-colors"
            title={t('teams.deleteTeam')}
          >
            <span className="material-symbols-outlined text-[14px] text-[var(--color-text-tertiary)]">delete</span>
          </button>

          <span
            className="material-symbols-outlined text-[14px] text-[var(--color-text-tertiary)] transition-transform duration-200"
            style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
          >
            expand_less
          </span>
        </div>

        {/* Expanded member list */}
        {expanded && (
          <div className="px-4 pb-2 pt-1 flex flex-col gap-0.5 max-h-[240px] overflow-y-auto border-t border-[var(--color-outline-variant)]/20">
            {members.map((member) => (
              <MemberRow key={member.agentId} member={member} onView={() => openMemberSession(member)} />
            ))}
          </div>
        )}
      </div>

      {/* Stop team confirmation dialog */}
      <ConfirmDialog
        open={showStopTeamDialog}
        onClose={() => setShowStopTeamDialog(false)}
        onConfirm={handleStopAndDeleteTeam}
        title={t('teams.stopAndDeleteTeamTitle')}
        body={t('teams.stopAndDeleteTeamBody', { count: runningCount })}
        confirmLabel={t('teams.stopAndDeleteTeam')}
        cancelLabel={t('teams.cancel')}
        confirmVariant="danger"
        loading={stoppingTeam}
      />

      {/* Delete team confirmation dialog */}
      <ConfirmDialog
        open={showDeleteTeamDialog}
        onClose={() => setShowDeleteTeamDialog(false)}
        onConfirm={handleDeleteTeam}
        title={t('teams.deleteTeamTitle')}
        body={t('teams.deleteTeamBody', { name: activeTeam.name })}
        confirmLabel={t('teams.delete')}
        cancelLabel={t('teams.cancel')}
        confirmVariant="danger"
        loading={deletingTeam}
      />

      {/* Force delete team confirmation dialog */}
      <ConfirmDialog
        open={showForceDeleteDialog}
        onClose={() => setShowForceDeleteDialog(false)}
        onConfirm={handleForceDeleteTeam}
        title={t('teams.forceDeleteTeamTitle')}
        body={t('teams.forceDeleteTeamBody', { name: activeTeam.name })}
        confirmLabel={t('teams.forceDelete')}
        cancelLabel={t('teams.cancel')}
        confirmVariant="danger"
        loading={deletingTeam}
      />
    </div>
  )
}

function MemberRow({ member, onView }: { member: TeamMember; onView: () => void }) {
  const t = useTranslation()
  const { deleteMember } = useTeamStore()
  const config = memberStatusConfig[member.status] || memberStatusConfig.idle
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showStopDialog, setShowStopDialog] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [stopping, setStopping] = useState(false)

  // Calculate runtime
  const elapsed = member.joinedAt
    ? formatDuration(Date.now() - new Date(member.joinedAt).getTime())
    : '--'
  const providerLabel = member.providerId === null ? 'official' : member.providerId
  const modelLabel = member.modelId ?? member.model
  const runtimeDisplay = [providerLabel, modelLabel].filter(Boolean).join(' / ')

  // Format token usage
  const totalTokens = (member.inputTokens ?? 0) + (member.outputTokens ?? 0)
  const tokenDisplay = totalTokens > 0
    ? `${formatCompact(member.inputTokens ?? 0)} / ${formatCompact(member.outputTokens ?? 0)}`
    : '--'

  const handleDeleteMemberClick = () => {
    if (member.status === 'running') {
      setShowStopDialog(true)
    } else {
      setShowDeleteDialog(true)
    }
  }

  const handleStopAndDeleteMember = async () => {
    setStopping(true)
    try {
      await deleteMember(member.agentId)
      setShowStopDialog(false)
    } catch (error) {
      console.error('Failed to stop and delete member:', error)
    } finally {
      setStopping(false)
    }
  }

  const handleDeleteMember = async () => {
    setDeleting(true)
    try {
      await deleteMember(member.agentId)
      setShowDeleteDialog(false)
    } catch (error) {
      console.error('Failed to delete member:', error)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <div
        onClick={onView}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onView()
          }
        }}
        className="w-full flex items-center gap-2 py-1.5 px-1 rounded-md text-left hover:bg-[var(--color-surface-container-low)] transition-colors group"
        title={`${member.role} - ${runtimeDisplay ? `${runtimeDisplay}, ` : ''}${t('teams.runtime')}: ${elapsed}, ${t('teams.tokens')}: ${tokenDisplay}`}
      >
        <span
          className={`material-symbols-outlined text-[16px] shrink-0 ${config.pulse ? 'animate-pulse-dot' : ''}`}
          style={{ color: config.color, fontVariationSettings: "'FILL' 1" }}
        >
          {config.icon}
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[12px] text-[var(--color-text-tertiary)]">smart_toy</span>
            <span className={`text-xs ${
              member.status === 'completed'
                ? 'text-[var(--color-text-tertiary)]'
                : 'text-[var(--color-text-primary)]'
            }`}>
              {member.role}
            </span>
          </div>

          {member.status === 'running' && member.currentTask && (
            <div className="flex items-center gap-1 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-warning)] animate-pulse-dot" />
              <span className="text-[10px] text-[var(--color-warning)] truncate">
                {member.currentTask}
              </span>
            </div>
          )}
        </div>

        {/* Runtime display */}
        {runtimeDisplay && (
          <span className="text-[10px] text-[var(--color-text-tertiary)] tabular-nums shrink min-w-0 max-w-[180px] truncate">
            {runtimeDisplay}
          </span>
        )}

        <span className="text-[10px] text-[var(--color-text-tertiary)] tabular-nums shrink-0">
          {elapsed}
        </span>

        {/* Token display */}
        <span className="text-[10px] text-[var(--color-text-tertiary)] tabular-nums shrink-0 max-w-[60px] truncate">
          {tokenDisplay}
        </span>

        {/* Delete member button */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            handleDeleteMemberClick()
          }}
          className="p-0.5 rounded hover:bg-[var(--color-surface-container-high)] transition-colors opacity-0 group-hover:opacity-100"
          title={t('teams.deleteMember')}
        >
          <span className="material-symbols-outlined text-[12px] text-[var(--color-text-tertiary)]">close</span>
        </button>

        <span className="material-symbols-outlined text-[14px] text-[var(--color-text-tertiary)] opacity-0 group-hover:opacity-100 transition-opacity">
          open_in_new
        </span>
      </div>

      {/* Stop member confirmation dialog */}
      <ConfirmDialog
        open={showStopDialog}
        onClose={() => setShowStopDialog(false)}
        onConfirm={handleStopAndDeleteMember}
        title={t('teams.stopAndDeleteMemberTitle')}
        body={t('teams.stopAndDeleteMemberBody', { name: member.role })}
        confirmLabel={t('teams.stopAndDeleteMember')}
        cancelLabel={t('teams.cancel')}
        confirmVariant="danger"
        loading={stopping}
      />

      {/* Delete member confirmation dialog */}
      <ConfirmDialog
        open={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleDeleteMember}
        title={t('teams.deleteMemberTitle')}
        body={t('teams.deleteMemberBody', { name: member.role })}
        confirmLabel={t('teams.delete')}
        cancelLabel={t('teams.cancel')}
        confirmVariant="danger"
        loading={deleting}
      />
    </>
  )
}
