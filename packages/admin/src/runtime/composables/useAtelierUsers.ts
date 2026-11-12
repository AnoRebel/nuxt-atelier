// The CMS users, for roles with the `users` capability: list, create, change and delete. The server keeps the
// last administrator and refuses role changes the user isn't allowed to make.
import type { AdminUser } from '../types'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed } from 'vue'
import { atelierFetch } from './useAtelierAdmin'

export interface UserInput { email: string, name?: string | null, role: string, password?: string }

export function useAtelierUsers() {
  const client = useQueryClient()
  const list = useQuery({ queryKey: ['atelier', 'users'], queryFn: () => atelierFetch<AdminUser[]>('/users') })
  const refresh = () => client.invalidateQueries({ queryKey: ['atelier', 'users'] })
  const path = (id: string) => `/users/${encodeURIComponent(id)}`
  return {
    users: computed(() => list.data.value ?? []),
    loading: list.isPending,
    create: useMutation({ mutationFn: (user: UserInput) => atelierFetch<AdminUser>('/users', { method: 'POST', body: user }), onSuccess: refresh }),
    update: useMutation({ mutationFn: ({ id, ...changes }: Partial<UserInput> & { id: string }) => atelierFetch<AdminUser>(path(id), { method: 'PATCH', body: changes }), onSuccess: refresh }),
    remove: useMutation({ mutationFn: (id: string) => atelierFetch(path(id), { method: 'DELETE' }), onSuccess: refresh }),
  }
}
