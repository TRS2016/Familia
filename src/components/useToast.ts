import { createContext, useContext } from 'react'

export type ToastType = 'error' | 'success' | 'info'

export interface ToastContextValue {
  showToast: (opts: { type: ToastType; message: string; persistent?: boolean }) => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
