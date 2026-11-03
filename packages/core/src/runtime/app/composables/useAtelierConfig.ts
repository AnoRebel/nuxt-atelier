import { useRuntimeConfig } from '#imports'

/** Public Nuxt Atelier runtime config (`runtimeConfig.public.atelier`). */
export function useAtelierConfig() {
  return useRuntimeConfig().public.atelier
}
