import { useEffect, useState } from 'react'

/** Ora attuale in millisecondi, aggiornata ogni `everyMs` (per i cronometri). */
export function useNow(everyMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), everyMs)
    return () => window.clearInterval(id)
  }, [everyMs])
  return now
}
