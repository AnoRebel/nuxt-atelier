// `#atelier/server`: the server-side public API
import { useRuntimeConfig } from 'nuxt/server'

/** Private Nuxt Atelier runtime config (`runtimeConfig.atelier`), server only. */
export function useAtelierServerConfig() {
  return useRuntimeConfig().atelier
}
