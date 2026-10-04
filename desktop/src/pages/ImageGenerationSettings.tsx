import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, CircleAlert, Image, Loader2, Save } from 'lucide-react'
import { imagesApi, type ImageGenerationPreflightResult } from '../api/images'
import { Button } from '../components/shared/Button'
import { Input } from '../components/shared/Input'
import { useTranslation } from '../i18n'
import { useProviderStore } from '../stores/providerStore'
import { useSettingsStore } from '../stores/settingsStore'
import type { ImageGenerationSettings } from '../types/settings'

function sameSettings(a: ImageGenerationSettings, b: ImageGenerationSettings) {
  return a.enabled === b.enabled && a.providerId === b.providerId && a.model === b.model
}

function normalizeDraft(value: ImageGenerationSettings): ImageGenerationSettings {
  const providerId = value.providerId?.trim()
  const model = value.model?.trim()
  return {
    enabled: value.enabled,
    ...(providerId ? { providerId } : {}),
    ...(model ? { model } : {}),
  }
}

export function ImageGenerationSettings() {
  const t = useTranslation()
  const configured = useSettingsStore((state) => state.imageGeneration)
  const setImageGeneration = useSettingsStore((state) => state.setImageGeneration)
  const providers = useProviderStore((state) => state.providers)
  const hasLoadedProviders = useProviderStore((state) => state.hasLoadedProviders)
  const fetchProviders = useProviderStore((state) => state.fetchProviders)
  const [draft, setDraft] = useState<ImageGenerationSettings>(configured)
  const [isSaving, setIsSaving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ImageGenerationPreflightResult | null>(null)

  useEffect(() => {
    setDraft(configured)
  }, [configured])

  useEffect(() => {
    if (!hasLoadedProviders) void fetchProviders()
  }, [fetchProviders, hasLoadedProviders])

  const normalized = useMemo(() => normalizeDraft(draft), [draft])
  const canEnable = Boolean(normalized.providerId && normalized.model)
  const isDirty = !sameSettings(normalized, configured)

  const save = async () => {
    setError(null)
    setResult(null)
    if (normalized.enabled && !canEnable) {
      setError(t('settings.imageGeneration.error.required'))
      return false
    }
    setIsSaving(true)
    try {
      await setImageGeneration(normalized)
      return true
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t('settings.imageGeneration.error.save'))
      return false
    } finally {
      setIsSaving(false)
    }
  }

  const testConnection = async () => {
    if (!(await save())) return
    setIsTesting(true)
    setResult(null)
    try {
      setResult(await imagesApi.preflight())
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : t('settings.imageGeneration.error.test'))
    } finally {
      setIsTesting(false)
    }
  }

  const resultIsAvailable = result?.status === 'available' && result.availability === 'available'

  return (
    <section className="w-full max-w-3xl space-y-6" aria-labelledby="image-generation-heading">
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-[var(--color-text)]">
          <Image className="h-5 w-5" aria-hidden="true" />
          <h2 id="image-generation-heading" className="text-lg font-semibold">{t('settings.imageGeneration.title')}</h2>
        </div>
        <p className="text-sm leading-6 text-[var(--color-text-secondary)]">{t('settings.imageGeneration.description')}</p>
        <p className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-sm text-[var(--color-text-secondary)]">
          {t('settings.imageGeneration.independentHint')}
        </p>
      </header>

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-5">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            aria-label={t('settings.imageGeneration.enabled')}
            checked={draft.enabled}
            onChange={(event) => {
              setResult(null)
              setDraft((current) => ({ ...current, enabled: event.target.checked }))
            }}
            className="mt-1 h-4 w-4 accent-[var(--color-primary)]"
          />
          <span>
            <span className="block font-medium text-[var(--color-text)]">{t('settings.imageGeneration.enabled')}</span>
            <span className="mt-1 block text-sm text-[var(--color-text-secondary)]">{t('settings.imageGeneration.enabledHint')}</span>
          </span>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2">
            <span className="block text-sm font-medium text-[var(--color-text)]">{t('settings.imageGeneration.provider')}</span>
            <select
              aria-label={t('settings.imageGeneration.provider')}
              value={draft.providerId ?? ''}
              onChange={(event) => {
                setResult(null)
                setDraft((current) => ({ ...current, providerId: event.target.value || undefined }))
              }}
              className="h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
            >
              <option value="">{t('settings.imageGeneration.providerPlaceholder')}</option>
              {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
            </select>
            {!hasLoadedProviders && <span className="block text-xs text-[var(--color-text-secondary)]">{t('settings.imageGeneration.providersLoading')}</span>}
            {hasLoadedProviders && providers.length === 0 && <span className="block text-xs text-[var(--color-text-secondary)]">{t('settings.imageGeneration.noProviders')}</span>}
          </label>

          <label className="space-y-2">
            <span className="block text-sm font-medium text-[var(--color-text)]">{t('settings.imageGeneration.model')}</span>
            <Input
              aria-label={t('settings.imageGeneration.model')}
              value={draft.model ?? ''}
              placeholder={t('settings.imageGeneration.modelPlaceholder')}
              onChange={(event) => {
                setResult(null)
                setDraft((current) => ({ ...current, model: event.target.value || undefined }))
              }}
            />
          </label>
        </div>

        <p className="text-xs leading-5 text-[var(--color-text-secondary)]">{t('settings.imageGeneration.securityHint')}</p>

        {error && <p role="alert" className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">{error}</p>}
        {result && <div role="status" aria-live="polite" className="flex gap-2 rounded-md border border-[var(--color-border)] px-3 py-3 text-sm">
          {resultIsAvailable ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-green-600" aria-hidden="true" /> : <CircleAlert className="mt-0.5 h-4 w-4 text-amber-600" aria-hidden="true" />}
          <div>
            <p className="font-medium text-[var(--color-text)]">{resultIsAvailable ? t('settings.imageGeneration.savedAvailable') : t('settings.imageGeneration.unavailable')}</p>
            <p className="mt-1 text-[var(--color-text-secondary)]">{result.message}</p>
            {result.errorCode && <p className="mt-1 font-mono text-xs text-[var(--color-text-secondary)]">{result.errorCode}</p>}
          </div>
        </div>}

        <div className="space-y-2">
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => void save()} disabled={!isDirty || isSaving}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
              {t('settings.imageGeneration.save')}
            </Button>
            <Button variant="secondary" onClick={() => void testConnection()} disabled={!normalized.enabled || !canEnable || isSaving || isTesting}>
              {isTesting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {t('settings.imageGeneration.test')}
            </Button>
          </div>
          <p className="text-xs leading-5 text-[var(--color-text-secondary)]">{t('settings.imageGeneration.testHint')}</p>
          {!isDirty && normalized.enabled && canEnable && !isSaving && <p className="text-xs leading-5 text-[var(--color-text-secondary)]">{t('settings.imageGeneration.savedHint')}</p>}
        </div>
      </div>
    </section>
  )
}
