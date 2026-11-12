// The site's i18n module, as Atelier sees it: its locales and how they appear in URLs, read from the
// module's options at build time (the `atelier.i18n.module` option, or an adapter package, picks the module), so the
// catch-all page can tell `/de/produkte/stuhl` is `/produkte/stuhl` in German. Without one, locales come
// from the `locale` query parameter only.

/** How locales appear in URLs: the strategies both i18n modules share. */
type RouteStrategy = 'prefix' | 'prefix_except_default' | 'prefix_and_default' | 'no_prefix'

export interface I18nAdapter {
  /** The i18n module it reads: `nuxt-i18n-micro`, `@nuxtjs/i18n`. */
  name: string
  /** The site's locale codes. */
  locales: string[]
  defaultLocale: string
  strategy: RouteStrategy
}

/** A path's locale and the path without its locale prefix: `/de/about` → `de`, `/about`. */
export function splitLocalePath(adapter: I18nAdapter, path: string): { locale: string, path: string } {
  const [, first, rest] = /^\/([^/]+)(\/.*)?$/.exec(path) ?? []
  if (adapter.strategy !== 'no_prefix' && first && adapter.locales.includes(first))
    return { locale: first, path: rest ?? '/' }
  return { locale: adapter.defaultLocale, path }
}

/** `path` as served in `locale`: prefixed as the strategy wants. */
export function localePath(adapter: I18nAdapter, path: string, locale: string): string {
  const prefixed = adapter.strategy === 'prefix' || ((adapter.strategy === 'prefix_except_default' || adapter.strategy === 'prefix_and_default') && locale !== adapter.defaultLocale)
  return prefixed ? `/${locale}${path === '/' ? '' : path}` : path
}

/** An i18n module's options in either module's shape: locales as codes or `{ code }` objects. */
export function adapterFrom(name: string, options: { locales?: (string | { code: string })[], defaultLocale?: string, strategy?: string } | undefined): I18nAdapter | undefined {
  const locales = (options?.locales ?? []).map(l => typeof l === 'string' ? l : l.code).filter(Boolean)
  if (!locales.length)
    return undefined
  const strategies: RouteStrategy[] = ['prefix', 'prefix_except_default', 'prefix_and_default', 'no_prefix']
  const strategy = strategies.includes(options?.strategy as RouteStrategy) ? options!.strategy as RouteStrategy : 'prefix_except_default'
  return { name, locales, defaultLocale: options?.defaultLocale && locales.includes(options.defaultLocale) ? options.defaultLocale : locales[0]!, strategy }
}
