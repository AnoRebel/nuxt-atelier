// A site setting (robots…), for roles with the `settings` capability: its value, where it comes from (the
// admin, or the module options), saving it, and going back to the options.
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed } from 'vue'
import { atelierFetch } from './useAtelierAdmin'

export interface Setting<T> { value: T, source: 'database' | 'config', config: T }

export function useAtelierSetting<T>(key: string) {
  const client = useQueryClient()
  const queryKey = ['atelier', 'settings', key]
  const path = `/settings/${encodeURIComponent(key)}`
  const query = useQuery({ queryKey, queryFn: () => atelierFetch<Setting<T>>(path) })
  const update = (setting: Setting<T>) => client.setQueryData(queryKey, setting)
  return {
    setting: computed(() => query.data.value),
    loading: query.isPending,
    save: useMutation({ mutationFn: (value: T) => atelierFetch<Setting<T>>(path, { method: 'PUT', body: { value } }), onSuccess: update }),
    reset: useMutation({ mutationFn: () => atelierFetch<Setting<T>>(path, { method: 'DELETE' }), onSuccess: update }),
  }
}
