// Roles, for roles with the `roles` capability: every role with where it comes from, and saving or deleting
// the ones kept in the database. Roles defined in code and the built-in `admin` are read-only.
import type { Role, RoleEntry } from '../types'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed } from 'vue'
import { atelierFetch } from './useAtelierAdmin'

export function useAtelierRoles() {
  const client = useQueryClient()
  const list = useQuery({ queryKey: ['atelier', 'roles'], queryFn: () => atelierFetch<RoleEntry[]>('/roles') })
  // permissions change what the schema says the user may do
  const refresh = () => Promise.all([client.invalidateQueries({ queryKey: ['atelier', 'roles'] }), client.invalidateQueries({ queryKey: ['atelier', 'schema'] })])
  const path = (name: string) => `/roles/${encodeURIComponent(name)}`
  return {
    roles: computed(() => list.data.value ?? []),
    loading: list.isPending,
    save: useMutation({ mutationFn: ({ name, role }: { name: string, role: Role }) => atelierFetch<Role>(path(name), { method: 'PUT', body: role }), onSuccess: refresh }),
    remove: useMutation({ mutationFn: (name: string) => atelierFetch(path(name), { method: 'DELETE' }), onSuccess: refresh }),
  }
}
