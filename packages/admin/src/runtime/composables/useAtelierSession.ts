// The signed-in user, first-run setup, signing in and out.
import type { AdminUser } from '../types'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed } from 'vue'
import { atelierFetch } from './useAtelierAdmin'

export function useAtelierSession() {
  const client = useQueryClient()
  const me = useQuery({ queryKey: ['atelier', 'me'], queryFn: () => atelierFetch<{ user: AdminUser | null }>('/auth/me') })
  const setup = useQuery({ queryKey: ['atelier', 'setup'], queryFn: () => atelierFetch<{ needed: boolean, token?: boolean }>('/setup') })
  const providers = useQuery({ queryKey: ['atelier', 'providers'], queryFn: () => atelierFetch<{ providers: { id: string, name: string, url: string }[] }>('/auth/providers'), staleTime: Infinity })
  // a new user sees other data: empty everything cached (refetching what's on screen), then read who's signed in.
  // Reset, not removed: the admin stays mounted, and a removed query would leave its observers on a dead copy
  const reset = async () => {
    await client.resetQueries({ predicate: q => !['me', 'setup', 'providers'].includes(q.queryKey[1] as string) })
    await client.invalidateQueries({ queryKey: ['atelier'] })
  }

  const signIn = useMutation({
    mutationFn: (credentials: { email: string, password: string }) => atelierFetch<AdminUser>('/auth/login', { method: 'POST', body: credentials }),
    onSuccess: reset,
  })
  const signOut = useMutation({ mutationFn: () => atelierFetch('/auth/logout', { method: 'POST' }), onSuccess: reset })
  const createAdmin = useMutation({
    mutationFn: (admin: { email: string, name?: string, password: string, token?: string }) => atelierFetch<AdminUser>('/setup', { method: 'POST', body: admin }),
    onSuccess: reset,
  })

  return {
    user: computed(() => me.data.value?.user ?? null),
    /** True until it's known whether someone is signed in and whether setup is needed. */
    loading: computed(() => me.isPending.value || setup.isPending.value),
    /** No user exists yet: show first-run setup. */
    setupNeeded: computed(() => setup.data.value?.needed ?? false),
    /** Setup takes the server's setup token (NUXT_ATELIER_AUTH_SETUP_TOKEN). */
    setupToken: computed(() => setup.data.value?.token ?? false),
    /** Other ways to sign in (the auth adapter's OAuth providers): links that come back to `redirect`. */
    providers: computed(() => providers.data.value?.providers ?? []),
    signIn,
    signOut,
    createAdmin,
  }
}
