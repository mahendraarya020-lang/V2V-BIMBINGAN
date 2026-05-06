import { useEffect } from 'react'

export type ToastItem = {
  id: number
  title: string
  message: string
  kind: 'info' | 'warn' | 'error'
}

type Props = {
  toasts: ToastItem[]
  onDismiss: (id: number) => void
}

export function Toast({ toasts, onDismiss }: Props) {
  useEffect(() => {
    if (toasts.length === 0) return
    const timers = toasts.map((toast) => setTimeout(() => onDismiss(toast.id), 3000))
    return () => {
      timers.forEach((timer) => clearTimeout(timer))
    }
  }, [toasts, onDismiss])

  if (toasts.length === 0) return null

  return (
    <div className="toast-stack">
      {toasts.map((toast) => (
        <article key={toast.id} className={`toast ${toast.kind}`}>
          <div className="toast-head">
            <strong>{toast.title}</strong>
            <button
              type="button"
              className="toast-close"
              aria-label="Tutup notifikasi"
              onClick={() => onDismiss(toast.id)}
            >
              ×
            </button>
          </div>
          <p>{toast.message}</p>
        </article>
      ))}
    </div>
  )
}
