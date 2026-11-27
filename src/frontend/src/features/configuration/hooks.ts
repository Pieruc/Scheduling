import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createCalendar,
  createResource,
  createSkill,
  deactivateResource,
  getCalendars,
  getDomainProfiles,
  getResources,
  getSkills,
  updateCalendar,
  updateDomainProfile,
  updateResource,
} from '@/api/config'
import { queryKeys } from '@/api/queryKeys'
import type { CalendarInput, DomainProfileInput, ResourceInput } from '@/api/types/config'

export function useResources() {
  return useQuery({
    queryKey: queryKeys.resources.all,
    queryFn: ({ signal }) => getResources(signal),
  })
}

/** Calendari e competenze cambiano di rado: restano in cache 10 minuti. */
export function useCalendars() {
  return useQuery({
    queryKey: queryKeys.calendars.all,
    queryFn: ({ signal }) => getCalendars(signal),
    staleTime: 10 * 60_000,
  })
}

export function useSkills() {
  return useQuery({
    queryKey: queryKeys.skills.all,
    queryFn: ({ signal }) => getSkills(signal),
    staleTime: 10 * 60_000,
  })
}

/** Crea (isNew) o modifica una risorsa; poi ricarica l'elenco. */
export function useSaveResource() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ input, isNew }: { input: ResourceInput; isNew: boolean }) =>
      isNew ? createResource(input) : updateResource(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.resources.all }),
  })
}

export function useDeactivateResource() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deactivateResource(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.resources.all }),
  })
}

/** Crea o modifica un calendario; poi ricarica calendari e risorse (che ne mostrano il nome) */
export function useSaveCalendar() {
  const queryClient = useQueryClient()
  return useMutation({
    // id assente = nuovo calendario (il codice lo assegna il backend)
    mutationFn: ({ input, id }: { input: CalendarInput; id?: string }) =>
      id ? updateCalendar(id, input) : createCalendar(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.calendars.all }),
  })
}

export function useCreateSkill() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createSkill,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.skills.all }),
  })
}

export function useDomainProfiles() {
  return useQuery({
    queryKey: queryKeys.profiles.all,
    queryFn: ({ signal }) => getDomainProfiles(signal),
    staleTime: 10 * 60_000,
  })
}

export function useSaveProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ code, input }: { code: string; input: DomainProfileInput }) =>
      updateDomainProfile(code, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.profiles.all }),
  })
}
