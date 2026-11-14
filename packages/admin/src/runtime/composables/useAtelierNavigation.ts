// The admin's navigation: the dashboard, collections (grouped by `admin.group`), singletons, and the areas
// the user manages. A kit renders it; custom pages add to it.
import type { Capability } from '../types'
import { computed } from 'vue'
import customPages from '#atelier-admin-pages'
import { useAdminI18n } from '../i18n'
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

/** One entry of a collection: `labels.singular`, else its name without a plural "s" (`authors` → `Author`). */
export const singularLabel = (type: { name: string, labels?: { singular?: string } }) =>
  type.labels?.singular ?? humanize(type.name.replace(/(?<=[^s])s$/, ''))

/** Admin areas shown to those who manage them. */
const AREAS: { capability: Capability, label: string, icon: string, path: string }[] = [
  { capability: 'users', label: 'nav.users', icon: 'users', path: 'users' },
  { capability: 'roles', label: 'nav.roles', icon: 'shield', path: 'roles' },
  { capability: 'settings', label: 'nav.searchEngines', icon: 'search', path: 'settings/robots' },
]

/** Whether a user managing `capabilities` may open a page that requires any one of `requires` (none: everyone). */
export const allowed = (requires: readonly string[], capabilities: readonly string[]) =>
  !requires.length || requires.some(r => capabilities.includes(r))

export function useAtelierNavigation() {
  const { to } = useAtelierAdmin()
  const { schema } = useAtelierAdminSchema()
  const { t } = useAdminI18n()
  const items = computed<NavigationItem[]>(() => {
    const s = schema.value
    if (!s)
      return []
    return [
      { label: t('nav.dashboard'), icon: 'i-lucide-layout-dashboard', to: to() },
      ...s.collections.map(c => ({ label: c.labels?.plural ?? humanize(c.name), icon: c.admin?.icon ?? 'i-lucide-files', to: to('collections', c.name), group: c.admin?.group ?? t('nav.content') })),
      ...s.singletons.map(one => ({ label: one.label ?? humanize(one.name), icon: one.admin?.icon ?? 'i-lucide-file-text', to: to('singletons', one.name), group: one.admin?.group ?? t('nav.content') })),
      // the media library: everyone signed in browses it
      { label: t('nav.media'), icon: 'image', to: to('media'), group: t('nav.content') },
      ...AREAS.filter(a => s.capabilities.includes(a.capability)).map(a => ({ label: t(a.label), icon: a.icon, to: to(...a.path.split('/')), group: t('nav.settings') })),
      // the app's and plugins' pages, for those allowed to open them
      ...customPages
        .filter(p => !p.hidden && allowed(p.requires, s.capabilities))
        .toSorted((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map(p => ({ label: p.label, icon: p.icon ?? 'file-text', to: to(...p.path.split('/')), group: p.group ?? t('nav.tools') })),
    ]
  })
  return { items }
}
