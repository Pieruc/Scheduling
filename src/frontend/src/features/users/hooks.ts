import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import type { Role, UpdateUserRequest } from '@/api/types/auth'
import { approveUser, getUsers, rejectRegistration, updateUser } from '@/api/users'

/** Tutti gli utenti (solo ADMIN); i filtri per stato li fa la pagina */
export function useUsers(enabled = true) {
  return useQuery({
    queryKey: queryKeys.users.all,
    queryFn: ({ signal }) => getUsers(undefined, signal),
    enabled,
  })
}

/** Dopo ogni modifica si ricarica l'elenco */
function useUsersMutation<T>(fn: (arg: T) => Promise<unknown>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.users.all }),
  })
}

export const useApproveUser = () =>
  useUsersMutation(({ id, role }: { id: string; role: Role }) => approveUser(id, role))

export const useUpdateUser = () =>
  useUsersMutation(({ id, body }: { id: string; body: UpdateUserRequest }) => updateUser(id, body))

export const useRejectRegistration = () => useUsersMutation((id: string) => rejectRegistration(id))
