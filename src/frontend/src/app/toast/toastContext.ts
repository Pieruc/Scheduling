import { createContext, useContext } from 'react'

export type ToastApi = {
  success: (summary: string, detail?: string) => void
  error: (summary: string, detail?: string) => void
}

export const ToastContext = createContext<ToastApi | null>(null)

/** Notifiche brevi in basso a destra: useToast().success('Risorsa salvata') */
export function useToast(): ToastApi {
  const toast = useContext(ToastContext)
  if (!toast) throw new Error('useToast va usato dentro <ToastProvider>')
  return toast
}
