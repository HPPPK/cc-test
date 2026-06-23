import { useEffect, useMemo, useState } from 'react'
import { useSkillStore } from '../../stores/skillStore'
import { useSessionStore } from '../../stores/sessionStore'
import { useTranslation } from '../../i18n'
import type { SkillMeta, SkillSource } from '../../types/skill'

const SOURCE_ORDER: SkillSource[] = ['user', 'project', 'plugin', 'mcp', 'bundled']

export type SkillSortKey =
  | 'name'
  | 'nameDesc'
  | 'updatedAt'
  | 'updatedAtOldest'
  | 'createdAt'
  | 'createdAtOldest'
  | 'tokens'

type SkillListProps = {
  sortBy: SkillSortKey
  onSortByChange: (sortBy: SkillSortKey) => void
}

const SOURCE_ICONS: Record<SkillSource, string> = {
  user: 'person',
  project: 'folder',
  plugin: 'extension',
  mcp: 'hub',
  bundled: 'inventory_2',
}

const SOURCE_ACCENT_CLASSES: Record<SkillSource, string> = {
  user: 'bg-[var(--color-primary-fixed)] text-[var(--color-brand)]',
  project: 'bg-[var(--color-success-container)] text-[var(--color-success)]',
  plugin: 'bg-[var(--color-warning-container)] text-[var(--color-warning)]',
  mcp: 'bg-[var(--color-info-container)] text-[var(--color-info)]',
  bundled: 'bg-[var(--color-surface-container-high)] text-[var(--color-text-tertiary)]',
}

function estimateTokens(contentLength: number) {
  return Math.ceil(contentLength / 4)
}

function skillTitle(skill: SkillMeta) {
  return skill.displayName || skill.name
}

function skillSearchText(skill: SkillMeta, sourceLabel: string) {
  return [
    skill.name,
    skill.displayName,
    skill.description,
    sourceLabel,
    skill.version,
    skill.pluginName,
    skill.namespace,
    skill.referenceId,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function normalizeSkillSearchText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function skillTimeValue(value?: string) {
  if (!value) return null
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? null : timestamp
}

function compareByTime(
  aValue: string | undefined,
  bValue: string | undefined,
  direction: 'asc' | 'desc',
) {
  const aTime = skillTimeValue(aValue)
  const bTime = skillTimeValue(bValue)
  if (aTime === null && bTime === null) return 0
  if (aTime === null) return 1
  if (bTime === null) return -1
  return direction === 'desc' ? bTime - aTime : aTime - bTime
}

function compareByName(a: SkillMeta, b: SkillMeta) {
  return skillTitle(a).localeCompare(skillTitle(b), undefined, {
    sensitivity: 'base',
    numeric: true,
  })
}

function sortSkills(skills: SkillMeta[], sortBy: SkillSortKey) {
  return [...skills].sort((a, b) => {
    if (sortBy === 'name') return compareByName(a, b)
    if (sortBy === 'nameDesc') return compareByName(b, a)
    if (sortBy === 'updatedAt') {
      return compareByTime(a.updatedAt, b.updatedAt, 'desc') || compareByName(a, b)
    }
    if (sortBy === 'updatedAtOldest') {
      return compareByTime(a.updatedAt, b.updatedAt, 'asc') || compareByName(a, b)
    }
    if (sortBy === 'createdAt') {
      return compareByTime(a.createdAt, b.createdAt, 'desc') || compareByName(a, b)
    }
    if (sortBy === 'createdAtOldest') {
      return compareByTime(a.createdAt, b.createdAt, 'asc') || compareByName(a, b)
    }
    return estimateTokens(b.contentLength) - estimateTokens(a.contentLength) || compareByName(a, b)
  })
}

export function SkillList({ sortBy, onSortByChange }: SkillListProps) {
  const { skills, isLoading, error, fetchSkills, fetchSkillDetail } =
    useSkillStore()
  const sessions = useSessionStore((s) => s.sessions)
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const t = useTranslation()
  const [searchQuery, setSearchQuery] = useState('')
  const activeSession = sessions.find((session) => session.id === activeSessionId)
  const currentWorkDir = activeSession?.workDir || undefined

  useEffect(() => {
    fetchSkills(currentWorkDir)
  }, [fetchSkills, currentWorkDir])

  const filteredSkills = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()
    const compactQuery = normalizeSkillSearchText(normalizedQuery)
    const matches = normalizedQuery
      ? skills.filter((skill) => {
        const searchText = skillSearchText(skill, t(`settings.skills.source.${skill.source}`))
        return (
          searchText.includes(normalizedQuery) ||
          normalizeSkillSearchText(searchText).includes(compactQuery)
        )
      })
      : skills

    return sortSkills(matches, sortBy)
  }, [searchQuery, skills, sortBy, t])

  const sourceCounts = useMemo(() => {
    const result: Partial<Record<SkillSource, number>> = {}
    for (const skill of skills) {
      const src = skill.source as SkillSource
      result[src] = (result[src] ?? 0) + 1
    }
    return result
  }, [skills])

  const totalTokens = useMemo(
    () => skills.reduce((sum, skill) => sum + estimateTokens(skill.contentLength), 0),
    [skills],
  )

  const sourceCount = useMemo(
    () => SOURCE_ORDER.filter((source) => (sourceCounts[source] ?? 0) > 0).length,
    [sourceCounts],
  )

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin w-5 h-5 border-2 border-[var(--color-brand)] border-t-transparent rounded-full" />
      </div>
    )
  }

  if (error) {
    return <div className="text-sm text-[var(--color-error)] py-4">{error}</div>
  }

  if (skills.length === 0) {
    return (
      <div className="text-center py-12 rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-container-low)] px-6">
        <span className="material-symbols-outlined text-[40px] text-[var(--color-text-tertiary)] mb-2 block">
          auto_awesome
        </span>
        <p className="text-sm text-[var(--color-text-tertiary)]">
          {t('settings.skills.empty')}
        </p>
        <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
          {t('settings.skills.emptyHint')}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 min-w-0">
      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-container-low)] overflow-hidden">
        <div className="grid gap-4 px-5 py-5 min-w-0 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)] xl:items-end">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)] mb-2">
              {t('settings.skills.browserEyebrow')}
            </div>
            <div className="flex items-center gap-3 mb-2">
              <span className="material-symbols-outlined text-[22px] text-[var(--color-brand)]">
                auto_awesome
              </span>
              <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
                {t('settings.skills.browserTitle')}
              </h3>
            </div>
            <p className="text-sm leading-6 text-[var(--color-text-secondary)] max-w-3xl">
              {t('settings.skills.browserDescription')}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 min-w-0 sm:grid-cols-3">
            <SummaryCard
              label={t('settings.skills.summary.totalSkills')}
              value={String(skills.length)}
              icon="auto_awesome"
            />
            <SummaryCard
              label={t('settings.skills.summary.sources')}
              value={String(sourceCount)}
              icon="layers"
            />
            <SummaryCard
              label={t('settings.skills.summary.tokens')}
              value={t('settings.skills.tokenEstimateShort', { count: String(totalTokens) })}
              icon="notes"
              className="col-span-2 sm:col-span-1"
            />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_240px_auto] lg:items-center">
          <label className="relative block min-w-0">
            <span className="sr-only">{t('settings.skills.searchLabel')}</span>
            <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-[var(--color-text-tertiary)]">
              search
            </span>
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={t('settings.skills.searchPlaceholder')}
              className="h-10 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-container-low)] pl-10 pr-10 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] outline-none transition-colors focus:border-[var(--color-brand)]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label={t('settings.skills.clearSearch')}
                className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            )}
          </label>

          <label className="relative block min-w-0">
            <span className="sr-only">{t('settings.skills.sortLabel')}</span>
            <select
              aria-label={t('settings.skills.sortLabel')}
              value={sortBy}
              onChange={(event) => onSortByChange(event.target.value as SkillSortKey)}
              className="h-10 w-full appearance-none rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-container-low)] px-3 pr-9 text-sm text-[var(--color-text-primary)] outline-none transition-colors focus:border-[var(--color-brand)]"
            >
              <option value="name">{t('settings.skills.sort.name')}</option>
              <option value="nameDesc">{t('settings.skills.sort.nameDesc')}</option>
              <option value="updatedAt">{t('settings.skills.sort.updatedAt')}</option>
              <option value="updatedAtOldest">{t('settings.skills.sort.updatedAtOldest')}</option>
              <option value="createdAt">{t('settings.skills.sort.createdAt')}</option>
              <option value="createdAtOldest">{t('settings.skills.sort.createdAtOldest')}</option>
              <option value="tokens">{t('settings.skills.sort.tokens')}</option>
            </select>
            <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[18px] text-[var(--color-text-tertiary)]">
              expand_more
            </span>
          </label>

          <div className="text-xs font-medium text-[var(--color-text-tertiary)] lg:text-right">
            {t('settings.skills.matchingCount', { count: String(filteredSkills.length) })}
          </div>
        </div>
      </section>

      {filteredSkills.length === 0 && (
        <div className="text-center py-10 rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-container-low)] px-6">
          <span className="material-symbols-outlined text-[34px] text-[var(--color-text-tertiary)] mb-2 block">
            search_off
          </span>
          <p className="text-sm font-medium text-[var(--color-text-primary)]">
            {t('settings.skills.noMatches')}
          </p>
          <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
            {t('settings.skills.noMatchesHint')}
          </p>
        </div>
      )}

      {filteredSkills.length > 0 && (
        <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden min-w-0">
          <div className="flex flex-col p-2">
            {filteredSkills.map((skill) => {
              const source = skill.source as SkillSource
              const sourceLabel = t(`settings.skills.source.${source}`)

              return (
                <button
                  key={`${skill.source}-${skill.name}`}
                  onClick={() =>
                    skill.hasDirectory &&
                    fetchSkillDetail(skill.source, skill.name, currentWorkDir, 'skills')
                  }
                  disabled={!skill.hasDirectory}
                  className="group rounded-xl border border-transparent px-3 py-3 text-left transition-all hover:border-[var(--color-border-focus)] hover:bg-[var(--color-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)] disabled:opacity-60 disabled:cursor-default disabled:hover:bg-transparent disabled:hover:border-transparent"
                >
                  <div className="flex items-start gap-3">
                    <span className={`mt-0.5 inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${SOURCE_ACCENT_CLASSES[source]}`}>
                      <span className="material-symbols-outlined text-[17px]">
                        {SOURCE_ICONS[source]}
                      </span>
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-[var(--color-text-primary)] break-all">
                          {skillTitle(skill)}
                        </span>
                        {skill.version && (
                          <span className="rounded-full bg-[var(--color-surface-container-high)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-text-tertiary)]">
                            v{skill.version}
                          </span>
                        )}
                        {skill.userInvocable && (
                          <span className="rounded-full border border-[var(--color-border)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-text-tertiary)]">
                            {t('settings.skills.slashCommand')}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)] break-words">
                        {skill.description}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--color-text-tertiary)]">
                        <span>{sourceLabel}</span>
                        <span>{t('settings.skills.tokenEstimateShort', { count: String(estimateTokens(skill.contentLength)) })}</span>
                        <span>{skill.hasDirectory ? t('settings.skills.ready') : t('settings.skills.unavailable')}</span>
                      </div>
                    </div>
                    <span className="material-symbols-outlined text-[18px] text-[var(--color-text-tertiary)] opacity-60 transition-transform group-hover:translate-x-0.5 group-hover:opacity-100">
                      chevron_right
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}

function SummaryCard({
  label,
  value,
  icon,
  className = '',
}: {
  label: string
  value: string
  icon: string
  className?: string
}) {
  return (
    <div className={`rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3 min-w-0 ${className}`}>
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] text-[var(--color-text-tertiary)] min-w-0">
        <span className="material-symbols-outlined text-[14px] flex-shrink-0">{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-2 text-lg font-semibold text-[var(--color-text-primary)] truncate">
        {value}
      </div>
    </div>
  )
}
