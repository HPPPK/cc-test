import { useEffect, useMemo, useState } from 'react'
import { Eye, EyeOff, Plus, Save, Trash2 } from 'lucide-react'
import { Button } from '../components/shared/Button'
import { useTranslation } from '../i18n'
import { useSettingsStore } from '../stores/settingsStore'

type EnvRow = {
  id: string
  key: string
  value: string
}

const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

function createRow(key = '', value = ''): EnvRow {
  return {
    id: crypto.randomUUID(),
    key,
    value,
  }
}

function rowsFromEnv(env: Record<string, string>): EnvRow[] {
  const rows = Object.entries(env).map(([key, value]) => createRow(key, value))
  return rows.length > 0 ? rows : [createRow()]
}

function buildEnv(rows: EnvRow[], t: ReturnType<typeof useTranslation>): {
  env: Record<string, string>
  error: string | null
} {
  const env: Record<string, string> = {}
  const seen = new Set<string>()

  for (const row of rows) {
    const key = row.key.trim()
    const value = row.value
    if (!key && !value) continue
    if (!key) {
      return { env: {}, error: t('settings.environment.errorMissingKey') }
    }
    if (!ENV_KEY_PATTERN.test(key)) {
      return { env: {}, error: t('settings.environment.errorInvalidKey', { key }) }
    }
    if (seen.has(key)) {
      return { env: {}, error: t('settings.environment.errorDuplicateKey', { key }) }
    }
    seen.add(key)
    env[key] = value
  }

  return { env, error: null }
}

export function EnvironmentSettings() {
  const t = useTranslation()
  const agentEnvironmentVariables = useSettingsStore((state) => state.agentEnvironmentVariables)
  const setAgentEnvironmentVariables = useSettingsStore((state) => state.setAgentEnvironmentVariables)
  const [rows, setRows] = useState<EnvRow[]>(() => rowsFromEnv(agentEnvironmentVariables))
  const [showValues, setShowValues] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setRows(rowsFromEnv(agentEnvironmentVariables))
  }, [agentEnvironmentVariables])

  useEffect(() => {
    if (!saved) return
    const timer = window.setTimeout(() => setSaved(false), 2500)
    return () => window.clearTimeout(timer)
  }, [saved])

  const envPreview = useMemo(() => {
    const count = Object.keys(agentEnvironmentVariables).length
    return t(count === 1 ? 'settings.environment.countOne' : 'settings.environment.countOther', { count })
  }, [agentEnvironmentVariables, t])

  const updateRow = (id: string, field: 'key' | 'value', value: string) => {
    setRows((current) => current.map((row) => row.id === id ? { ...row, [field]: value } : row))
    setError(null)
    setSaved(false)
  }

  const addRow = () => {
    setRows((current) => [...current, createRow()])
    setError(null)
  }

  const removeRow = (id: string) => {
    setRows((current) => {
      const next = current.filter((row) => row.id !== id)
      return next.length > 0 ? next : [createRow()]
    })
    setError(null)
    setSaved(false)
  }

  const save = async () => {
    const result = buildEnv(rows, t)
    if (result.error) {
      setError(result.error)
      return
    }

    setSaving(true)
    setError(null)
    try {
      await setAgentEnvironmentVariables(result.env)
      setSaved(true)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t('settings.environment.errorSave'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="w-full max-w-5xl min-w-0">
      <div className="mb-6">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-normal text-[var(--color-text-primary)]">
              {t('settings.environment.title')}
            </h2>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              {t('settings.environment.description')}
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-text-secondary)]">
            {envPreview}
          </span>
        </div>
      </div>

      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-container-low)] overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">{t('settings.environment.variables')}</h3>
            <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">{t('settings.environment.liveHint')}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            icon={showValues ? <EyeOff size={15} /> : <Eye size={15} />}
            onClick={() => setShowValues((value) => !value)}
            aria-label={showValues ? t('settings.environment.hideValues') : t('settings.environment.showValues')}
          >
            {showValues ? t('settings.environment.hideValues') : t('settings.environment.showValues')}
          </Button>
        </div>

        <div className="px-4 py-3">
          <div className="hidden px-1 pb-2 text-xs font-medium text-[var(--color-text-tertiary)] sm:grid sm:grid-cols-[minmax(140px,0.9fr)_minmax(180px,1.1fr)_40px] sm:gap-2">
            <span>{t('settings.environment.key')}</span>
            <span>{t('settings.environment.value')}</span>
            <span className="sr-only">{t('common.delete')}</span>
          </div>
          <div className="flex flex-col gap-2">
            {rows.map((row) => (
              <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_40px] gap-2 sm:grid-cols-[minmax(140px,0.9fr)_minmax(180px,1.1fr)_40px]">
                <input
                  value={row.key}
                  onChange={(event) => updateRow(row.id, 'key', event.target.value)}
                  placeholder={t('settings.environment.keyPlaceholder')}
                  className="h-10 min-w-0 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 font-mono text-sm text-[var(--color-text-primary)] outline-none transition-colors focus:border-[var(--color-border-focus)] focus:shadow-[var(--shadow-focus-ring)]"
                />
                <input
                  value={row.value}
                  type={showValues ? 'text' : 'password'}
                  onChange={(event) => updateRow(row.id, 'value', event.target.value)}
                  placeholder={t('settings.environment.valuePlaceholder')}
                  className="col-span-2 h-10 min-w-0 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 font-mono text-sm text-[var(--color-text-primary)] outline-none transition-colors focus:border-[var(--color-border-focus)] focus:shadow-[var(--shadow-focus-ring)] sm:col-span-1"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Trash2 size={15} />}
                  onClick={() => removeRow(row.id)}
                  aria-label={t('settings.environment.removeVariable', { key: row.key.trim() || t('settings.environment.unnamedVariable') })}
                  className="h-10 w-10 px-0"
                />
              </div>
            ))}
          </div>

          {error && <p className="mt-3 text-sm text-[var(--color-error)]">{error}</p>}
          {saved && !error && <p className="mt-3 text-sm text-green-600">{t('settings.environment.saved')}</p>}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button variant="secondary" icon={<Plus size={15} />} onClick={addRow}>
              {t('settings.environment.addVariable')}
            </Button>
            <Button icon={<Save size={15} />} loading={saving} onClick={() => void save()}>
              {t('settings.environment.save')}
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}
