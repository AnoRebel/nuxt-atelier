// The admin's navigation: the dashboard, collections (grouped by `admin.group`), singletons, and the areas
// the user manages. A kit renders it; custom pages add to it.
import type { Capability } from '../types'
import { computed } from 'vue'
import { useAtelierAdmin } from './useAtelierAdmin'
import { useAtelierAdminSchema } from './useAtelierAdminSchema'

export interface NavigationItem {
  label: string
  icon: string
  to: string
  group?: string
}

/** `blogPosts` → `Blog posts` */
export const humanize = (name: string) => {
  const words = name.replace(/([a-z\d])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** Admin areas shown to those who manage them (users and roles screens: task 15.4). */
const AREAS: { capability: Capability, label: string, icon: string, path: string }[] = []

export function useAtelierNavigation() {
  const { to } = useAtelierAdmin()
  const { schema } = useAtelierAdminSchema()
  const items = computed<NavigationItem[]>(() => {
    const s = schema.value
    if (!s)
      return []
    return [
      { label: 'Dashboard', icon: 'i-lucide-layout-dashboard', to: to() },
      ...s.collections.map(c => ({ label: c.labels?.plural ?? humanize(c.name), icon: c.admin?.icon ?? 'i-lucide-files', to: to('collections', c.name), group: c.admin?.group ?? 'Content' })),
      ...s.singletons.map(t => ({ label: t.label ?? humanize(t.name), icon: t.admin?.icon ?? 'i-lucide-file-text', to: to('singletons', t.name), group: t.admin?.group ?? 'Content' })),
      ...AREAS.filter(a => s.capabilities.includes(a.capability)).map(a => ({ label: a.label, icon: a.icon, to: to(a.path), group: 'Settings' })),
    ]
  })
  return { items }
}
