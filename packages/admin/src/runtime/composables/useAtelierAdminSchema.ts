// The content types, blocks and locales, as the signed-in user may see and use them.
import type { AdminSchema } from '../types'
import { useQuery } from '@tanstack/vue-query'
import { computed } from 'vue'
import { atelierFetch } from './useAtelierAdmin'

export function useAtelierAdminSchema() {
  const query = useQuery({ queryKey: ['atelier', 'schema'], queryFn: () => atelierFetch<AdminSchema>('/schema'), staleTime: 60_000 })
  return {
    ...query,
    schema: computed(() => query.data.value),
    collection: (name: string) => computed(() => query.data.value?.collections.find(c => c.name === name)),
    singleton: (name: string) => computed(() => query.data.value?.singletons.find(s => s.name === name)),
  }
}
