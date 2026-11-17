import { Toast } from 'primereact/toast'
import { useMemo, useRef, type ReactNode } from 'react'
import { ToastContext, type ToastApi } from './toastContext'

/** Monta un solo <Toast> per tutta l'app e lo espone con useToast(). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const ref = useRef<Toast>(null)

  const api = useMemo<ToastApi>(
    () => ({
      success: (summary, detail) =>
        ref.current?.show({ severity: 'success', summary, detail, life: 3500 }),
      error: (summary, detail) =>
        ref.current?.show({ severity: 'error', summary, detail, life: 6000 }),
    }),
    [],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <Toast ref={ref} position="bottom-right" />
    </ToastContext.Provider>
  )
}
