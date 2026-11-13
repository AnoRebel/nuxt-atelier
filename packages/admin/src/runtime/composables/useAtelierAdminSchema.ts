// The content types, blocks and locales, as the signed-in user may see and use them.
import type { AdminApiError, AdminSchema } from '../types'
import { useQuery } from '@tanstack/vue-query'
import { computed } from 'vue'
import { atelierFetch, chooseSite, chosenSite } from './useAtelierAdmin'

export function useAtelierAdminSchema() {
  const query = useQuery({
    queryKey: ['atelier', 'schema'],
    queryFn: async () => {
      try {
        return await atelierFetch<AdminSchema>('/schema')
      }
      catch (error) {
        // a remembered site the user can't reach (anymore): back to this address's site
        if ((error as AdminApiError).status === 403 && chosenSite()) {
          chooseSite(undefined)
          return atelierFetch<AdminSchema>('/schema')
        }
        throw error
      }
    },
    staleTime: 60_000,
  })
  return {
    ...query,
    schema: computed(() => query.data.value),
    collection: (name: string) => computed(() => query.data.value?.collections.find(c => c.name === name)),
    singleton: (name: string) => computed(() => query.data.value?.singletons.find(s => s.name === name)),
  }
}
