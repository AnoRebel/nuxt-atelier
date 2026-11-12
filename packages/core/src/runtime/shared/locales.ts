// Content locales: which there are, the default, and where a read looks when content is missing in the
// requested one. From the `locales` module option.

/** A locale code: `en`, `pt-br`, `zh-hant-tw`. */
export const LOCALE_CODE = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i

export interface Locales {
  codes: string[]
  default: string
  /** Fallback locales per locale, in order; every locale not listed falls back to the default. */
  fallback: Record<string, string[]>
}

/** The locales with defaults filled in: one locale, `en`, when none are configured. */
export function resolveLocales(config?: { codes?: string[], default?: string, fallback?: Record<string, string[]> }): Locales {
  const codes = config?.codes?.length ? config.codes : ['en']
  return { codes, default: config?.default ?? codes[0]!, fallback: config?.fallback ?? {} }
}

/** Where a read in `locale` looks, in order: the locale itself, then its fallbacks, then the default. */
export function fallbackChain(locales: Locales, locale: string): string[] {
  return [...new Set([locale, ...locales.fallback[locale] ?? [], locales.default])]
}
