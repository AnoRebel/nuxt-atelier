// The signed-in user, first-run setup, signing in and out.
import type { AdminUser } from '../types'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed } from 'vue'
import { atelierFetch } from './useAtelierAdmin'

export function useAtelierSession() {
  const client = useQueryClient()
  const me = useQuery({ queryKey: ['atelier', 'me'], queryFn: () => atelierFetch<{ user: AdminUser | null }>('/auth/me') })
  const setup = useQuery({ queryKey: ['atelier', 'setup'], queryFn: () => atelierFetch<{ needed: boolean }>('/setup') })
  // a new user sees other data: drop everything cached, then read who's signed in
  const reset = async () => {
    client.removeQueries({ predicate: q => q.queryKey[1] !== 'me' && q.queryKey[1] !== 'setup' })
    await client.invalidateQueries({ queryKey: ['atelier'] })
  }

  const signIn = useMutation({
    mutationFn: (credentials: { email: string, password: string }) => atelierFetch<AdminUser>('/auth/login', { method: 'POST', body: credentials }),
    onSuccess: reset,
  })
  const signOut = useMutation({ mutationFn: () => atelierFetch('/auth/logout', { method: 'POST' }), onSuccess: reset })
  const createAdmin = useMutation({
    mutationFn: (admin: { email: string, name?: string, password: string }) => atelierFetch<AdminUser>('/setup', { method: 'POST', body: admin }),
    onSuccess: reset,
  })

  return {
    user: computed(() => me.data.value?.user ?? null),
    /** True until it's known whether someone is signed in and whether setup is needed. */
    loading: computed(() => me.isPending.value || setup.isPending.value),
    /** No user exists yet: show first-run setup. */
    setupNeeded: computed(() => setup.data.value?.needed ?? false),
    signIn,
    signOut,
    createAdmin,
  }
}
