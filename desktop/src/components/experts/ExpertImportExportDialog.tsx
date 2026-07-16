import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { expertsApi, type ExpertPackImportPreview, type ExpertPackSummary } from '../../api/experts'
import { useTranslation } from '../../i18n'
import { useUIStore } from '../../stores/uiStore'
import { Button } from '../shared/Button'
import { Modal } from '../shared/Modal'

const EMPTY_SELECTED_PACK_IDS: string[] = []

type ExpertImportExportDialogProps = {
  mode: 'import' | 'export'
  open: boolean
  packs: ExpertPackSummary[]
  initialSelectedPackIds?: string[]
  onClose: () => void
  onImported?: () => void | Promise<void>
}

export function ExpertImportExportDialog({
  mode,
  open,
  packs,
  initialSelectedPackIds = EMPTY_SELECTED_PACK_IDS,
  onClose,
  onImported,
}: ExpertImportExportDialogProps) {
  const t = useTranslation()
  const addToast = useUIStore((state) => state.addToast)
  const [preview, setPreview] = useState<ExpertPackImportPreview | null>(null)
  const [importDataBase64, setImportDataBase64] = useState<string | null>(null)
  const [importFileName, setImportFileName] = useState('')
  const [selectedPackIds, setSelectedPackIds] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setPreview(null)
    setImportDataBase64(null)
    setImportFileName('')
    setBusy(false)
    setError(null)
    setSuccess(null)
    setSelectedPackIds(new Set(initialSelectedPackIds.length > 0 ? initialSelectedPackIds : packs.map((pack) => pack.packId)))
  }, [initialSelectedPackIds, open, packs])

  const selectedPacks = useMemo(
    () => packs.filter((pack) => selectedPackIds.has(pack.packId)),
    [packs, selectedPackIds],
  )

  if (!open) return null

  const handleImportFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setBusy(true)
    setError(null)
    setSuccess(null)
    setPreview(null)
    setImportDataBase64(null)

    try {
      const dataBase64 = await fileToBase64(file)
      const nextPreview = await expertsApi.previewImport(dataBase64)
      setImportFileName(file.name)
      setImportDataBase64(dataBase64)
      setPreview(nextPreview)
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  const handleImport = async () => {
    if (!importDataBase64 || !preview?.canImport) return
    setBusy(true)
    setError(null)
    setSuccess(null)

    try {
      const result = await expertsApi.importPack(importDataBase64)
      await onImported?.()
      const message = t('settings.experts.import.success', { name: result.pack.name })
      setSuccess(message)
      addToast({ type: 'success', message })
    } catch (cause) {
      const message = errorMessage(cause)
      setError(message)
      addToast({ type: 'error', message })
    } finally {
      setBusy(false)
    }
  }

  const handleExport = async () => {
    if (selectedPacks.length === 0) return
    setBusy(true)
    setError(null)
    setSuccess(null)

    try {
      for (const pack of selectedPacks) {
        downloadZip(await expertsApi.exportPack(pack.packId))
      }
      const message = t('settings.experts.export.success', { count: selectedPacks.length })
      setSuccess(message)
      addToast({ type: 'success', message })
    } catch (cause) {
      const message = errorMessage(cause)
      setError(message)
      addToast({ type: 'error', message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title={mode === 'import' ? t('settings.experts.import.title') : t('settings.experts.export.title')}
      width={680}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          {mode === 'import' ? (
            <Button onClick={() => void handleImport()} disabled={busy || !preview?.canImport || !importDataBase64} loading={busy}>
              {t('settings.experts.import.commit')}
            </Button>
          ) : (
            <Button onClick={() => void handleExport()} disabled={busy || selectedPacks.length === 0} loading={busy}>
              {t('settings.experts.export.commit')}
            </Button>
          )}
        </>
      )}
    >
      <div className="space-y-4">
        {error ? (
          <div className="rounded-[8px] border border-[var(--color-error)]/30 bg-[var(--color-error)]/8 px-3 py-2 text-sm text-[var(--color-error)]">
            {error}
          </div>
        ) : null}
        {success ? (
          <div className="rounded-[8px] border border-[var(--color-success)]/30 bg-[var(--color-success)]/8 px-3 py-2 text-sm text-[var(--color-success)]">
            {success}
          </div>
        ) : null}

        {mode === 'import' ? (
          <>
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-[8px] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] px-4 py-4 transition-colors hover:bg-[var(--color-surface-hover)]">
              <span>
                <span className="block text-sm font-medium text-[var(--color-text-primary)]">{t('settings.experts.import.chooseZip')}</span>
                <span className="mt-1 block text-xs text-[var(--color-text-tertiary)]">{t('settings.experts.import.chooseZipHint')}</span>
              </span>
              <span className="material-symbols-outlined text-[20px] text-[var(--color-text-secondary)]" aria-hidden="true">file_upload</span>
              <input aria-label={t('settings.experts.import.chooseZip')} className="sr-only" type="file" accept=".zip,application/zip" onChange={(event) => void handleImportFileChange(event)} />
            </label>

            {importFileName ? <p className="text-xs text-[var(--color-text-tertiary)]">{importFileName}</p> : null}
            {preview ? (
              <div className="space-y-3 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] p-4">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">{preview.pack.name}</h3>
                  <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{preview.pack.packId} · v{preview.pack.version}</p>
                </div>
                <p className="text-sm leading-6 text-[var(--color-text-secondary)]">{preview.summary}</p>
                {preview.warnings.length > 0 ? (
                  <ul className="space-y-1 text-xs leading-5 text-[var(--color-warning)]">
                    {preview.warnings.map((warning) => <li key={warning}>• {warning}</li>)}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </>
        ) : (
          <>
            <p className="text-sm leading-6 text-[var(--color-text-secondary)]">{t('settings.experts.export.description')}</p>
            <div className="overflow-hidden rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)]">
              {packs.length > 0 ? (
                <div className="divide-y divide-[var(--color-border)]">
                  {packs.map((pack) => {
                    const checked = selectedPackIds.has(pack.packId)
                    return (
                      <label key={pack.packId} className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-[var(--color-surface-hover)]">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => setSelectedPackIds((current) => {
                            const next = new Set(current)
                            if (next.has(pack.packId)) next.delete(pack.packId)
                            else next.add(pack.packId)
                            return next
                          })}
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-[var(--color-text-primary)]">{pack.name}</span>
                          <span className="mt-0.5 block truncate font-mono text-[11px] text-[var(--color-text-tertiary)]">{pack.packId} · v{pack.version}</span>
                        </span>
                      </label>
                    )
                  })}
                </div>
              ) : (
                <div className="px-4 py-5 text-sm text-[var(--color-text-secondary)]">{t('settings.experts.manager.empty')}</div>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]!)
  return btoa(binary)
}

function downloadZip(result: Awaited<ReturnType<typeof expertsApi.exportPack>>) {
  const binary = atob(result.dataBase64)
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  const url = URL.createObjectURL(new Blob([bytes], { type: result.contentType }))
  const link = document.createElement('a')
  link.href = url
  link.download = result.filename
  link.rel = 'noopener'
  link.click()
  URL.revokeObjectURL(url)
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}
