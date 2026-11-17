import { useSyncExternalStore } from 'react'

/** true quando la media query è vera, es. useMediaQuery('(max-width: 600px)'). Si aggiorna da sola. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
  )
}
