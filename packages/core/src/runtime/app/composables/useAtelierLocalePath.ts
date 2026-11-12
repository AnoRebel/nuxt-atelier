import type { I18nAdapter } from '../../shared/i18n'
import { useRuntimeConfig } from '#imports'
import { localePath } from '../../shared/i18n'

/**
 * Turns an entry's path into the URL it's served at in a locale, prefixed as the site's i18n module
 * wants: `localePath('/produkte/stuhl', 'de')` → `/de/produkte/stuhl`. Unchanged without an i18n module.
 */
export function useAtelierLocalePath(): (path: string, locale: string) => string {
  const i18n = (useRuntimeConfig().public.atelier as { i18n?: I18nAdapter | null } | undefined)?.i18n
  return (path, locale) => i18n ? localePath(i18n, path, locale) : path
}
