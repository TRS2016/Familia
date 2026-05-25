import { createContext, useContext, useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import styles from './Toast.module.css'

// ── Types ─────────────────────────────────────────────────────────────────

export type ToastType = 'error' | 'success' | 'info'

interface ToastItem {
  id: string
  type: ToastType
  message: string
  leaving: boolean
  persistent?: boolean
}

interface ToastContextValue {
  showToast: (opts: { type: ToastType; message: string; persistent?: boolean }) => void
}

// ── Context ───────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}

// ── Provider ──────────────────────────────────────────────────────────────

const DISMISS_DELAY = 4000
const LEAVE_DURATION = 280

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const dismiss = useCallback((id: string) => {
    // Mark as leaving so exit animation plays
    setToasts(prev => prev.map(t => t.id === id ? { ...t, leaving: true } : t))
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, LEAVE_DURATION)
  }, [])

  const showToast = useCallback(({ type, message, persistent }: { type: ToastType; message: string; persistent?: boolean }) => {
    const id = crypto.randomUUID()
    setToasts(prev => [...prev, { id, type, message, leaving: false, persistent }])
    if (!persistent) setTimeout(() => dismiss(id), DISMISS_DELAY)
  }, [dismiss])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className={styles.container} aria-live="polite" aria-atomic="false">
        {toasts.map(t => (
          <Toast key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

// ── Toast item ────────────────────────────────────────────────────────────

const ICONS: Record<ToastType, string> = {
  error:   '⚠️',
  success: '✓',
  info:    'ℹ️',
}

const TYPE_CLASS: Record<ToastType, string> = {
  error:   styles.toastError,
  success: styles.toastSuccess,
  info:    styles.toastInfo,
}

function Toast({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  return (
    <div
      role="alert"
      className={[
        styles.toast,
        TYPE_CLASS[toast.type],
        toast.leaving ? styles.toastLeaving : '',
      ].join(' ')}
    >
      <span className={styles.icon}>{ICONS[toast.type]}</span>
      <span className={styles.message}>{toast.message}</span>
      <button
        className={styles.dismissBtn}
        onClick={onDismiss}
        aria-label="Fermer"
      >
        <X size={12} strokeWidth={2.5} />
      </button>
    </div>
  )
}
