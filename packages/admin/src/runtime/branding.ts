// The admin's branding and theme from app config, changeable without rebuilding the admin:
//
//   export default defineAppConfig({
//     atelierAdmin: {
//       name: 'Acme CMS',
//       logo: '/logo.svg',
//       favicon: '/admin-icon.svg',
//       tokens: { '--accent-primary-base': '#e4572e' }, // crystal-neuo tokens
//       appearance: { material: 'folio', nav: 'top' },   // the default appearance, before a viewer picks theirs
//     },
//   })
import type { Appearance } from './appearance'
import { computed } from 'vue'
import { useAppConfig } from '#imports'

interface AdminBranding {
  name?: string
  logo?: string
  favicon?: string
  tokens?: Record<string, string>
  appearance?: Partial<Appearance>
}

export function useBranding() {
  const config = useAppConfig() as { atelierAdmin?: AdminBranding }
  return computed(() => ({
    name: config.atelierAdmin?.name ?? 'Nuxt Atelier',
    logo: config.atelierAdmin?.logo,
    favicon: config.atelierAdmin?.favicon,
    // custom properties only: a token can't smuggle in other declarations
    tokens: Object.fromEntries(Object.entries(config.atelierAdmin?.tokens ?? {}).filter(([key, value]) => /^--[\w-]+$/.test(key) && !/[;{}]/.test(value))),
    appearance: config.atelierAdmin?.appearance ?? {},
  }))
}
