import { createPortal } from 'react-dom'

import { useUIStore, type Toast as ToastType } from '../../stores/uiStore'

const typeStyles: Record<ToastType['type'], string> = {
  success: 'border-l-4 border-l-[var(--color-success)]',
  error: 'border-l-4 border-l-[var(--color-error)]',
  warning: 'border-l-4 border-l-[var(--color-warning)]',
  info: 'border-l-4 border-l-[var(--color-text-accent)]',
}

function ToastItem({ toast }: { toast: ToastType }) {
  const removeToast = useUIStore((s) => s.removeToast)

  return (
    <div
      className={`
        pointer-events-auto w-full max-w-sm
        bg-[var(--color-surface)] rounded-[var(--radius-md)] shadow-[var(--shadow-dropdown)]
        px-4 py-3 text-sm text-[var(--color-text-primary)]
        ${typeStyles[toast.type]}
        animate-in slide-in-from-right fade-in duration-200
      `}
    >
      <div className="flex items-center justify-between gap-2">
        <span>{toast.message}</span>
        <button
          onClick={() => removeToast(toast.id)}
          className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] text-lg leading-none"
        >
          ×
        </button>
      </div>
    </div>
  )
}

export function ToastContainer() {
  const toasts = useUIStore((s) => s.toasts)

  if (toasts.length === 0) return null

  const toastLayer = (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[1000] flex flex-col items-end gap-2 px-4 sm:px-6">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  )

  if (typeof document === 'undefined') return toastLayer

  return createPortal(toastLayer, document.body)
}
