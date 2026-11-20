import { useQuery } from '@tanstack/react-query'
import { getActiveModels, getModelsStatus, getModelVersions } from '@/api/models'
import { queryKeys } from '@/api/queryKeys'

/** Modelli AI attivi: cambiano di rado, quindi restano in cache 10 minuti. */
export function useActiveModels() {
  return useQuery({
    queryKey: queryKeys.models.active,
    queryFn: ({ signal }) => getActiveModels(signal),
    staleTime: 10 * 60_000,
  })
}

/** Storico delle versioni (contratti A.7, riservato all'amministratore dopo il login) */
export function useModelVersions() {
  return useQuery({
    queryKey: queryKeys.models.versions,
    queryFn: ({ signal }) => getModelVersions(signal),
    staleTime: 10 * 60_000,
  })
}

/** Servizi attivi e uso del metodo di riserva; si ricarica ogni minuto */
export function useModelsStatus() {
  return useQuery({
    queryKey: queryKeys.models.status,
    queryFn: ({ signal }) => getModelsStatus(signal),
    refetchInterval: 60_000,
  })
}
