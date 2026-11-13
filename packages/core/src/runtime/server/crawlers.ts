// What crawlers get: robots.txt groups (the admin's or the options' rules, with the admin and the CMS API
// always disallowed) and the sitemap's URLs (published, indexable, routable entries the public may read,
// with their translations as alternates).
import type { I18nAdapter } from '../shared/i18n'
import type { RobotsGroup, SitemapUrl } from './crawlers-text'
import type { RobotsSettings } from './settings'
import { useRuntimeConfig } from 'nuxt/server'
import { localePath } from '../shared/i18n'
import { PUBLIC_ROLE } from '../shared/policy'
import { useAtelierEntries, useAtelierPolicy, useAtelierSchema, useAtelierSettings } from './index'
import { robotsGroups } from './crawlers-text'
import { logger } from './logger'

export { robotsTxt, sitemapXml } from './crawlers-text'
export type { RobotsGroup, SitemapUrl } from './crawlers-text'

const publicConfig = () => useRuntimeConfig().public.atelier as { siteUrl?: string, admin?: { base?: string }, i18n?: I18nAdapter | null }
const adminBase = () => publicConfig().admin?.base ?? '/admin'

/**
 * The robots groups in effect. When the database can't be read (not set up yet, a site prerendered without
 * one), the module options' rules, so crawlers still get the admin and API kept out.
 */
export async function useRobotsGroups(): Promise<RobotsGroup[]> {
  try {
    return robotsGroups((await (await useAtelierSettings()).get('robots')).value, adminBase())
  }
  catch (error) {
    logger.warn('robots.txt: the robots settings couldn\'t be read, using the module options', { error })
    const option = (useRuntimeConfig().atelier as { robots?: unknown }).robots // "" when unset (runtime config)
    const config = typeof option === 'object' ? option as Partial<RobotsSettings> | null : null
    return robotsGroups({ indexable: config?.indexable ?? true, rules: (config?.rules ?? []).map(r => ({ userAgent: r.userAgent ?? ['*'], allow: r.allow ?? [], disallow: r.disallow ?? [] })) }, adminBase())
  }
}

const PAGE = 500

/** Every published, indexable page of the CMS; none, with a warning, when the database can't be read. */
export async function sitemapUrls(): Promise<SitemapUrl[]> {
  try {
    return await readSitemapUrls()
  }
  catch (error) {
    logger.warn('sitemap: the CMS pages couldn\'t be read, so none are listed', { error })
    return []
  }
}

/** Every published, indexable page of the CMS, as paths (and their translations' paths) with their last change. */
async function readSitemapUrls(): Promise<SitemapUrl[]> {
  const { collections, singletons, locales } = await useAtelierSchema()
  const entries = await useAtelierEntries()
  const policy = await useAtelierPolicy()
  const visitor = { id: '', role: PUBLIC_ROLE }
  const i18n = publicConfig().i18n
  const url = (path: string, locale: string | undefined) => i18n && locale ? localePath(i18n, path, locale) : path
  const noindex = (data: Record<string, unknown>) => (data.seo as { noindex?: unknown } | undefined)?.noindex === true

  const urls: SitemapUrl[] = []
  for (const [name, definition] of Object.entries(collections)) {
    if (!definition.route || !policy.can(visitor, 'read', name))
      continue
    // every version: a localized type has one per locale
    const pages: { id: string, path: string, locale?: string, updatedAt: string, translations?: Record<string, string> }[] = []
    for (const locale of definition.localized ? locales.codes : [undefined]) {
      for (let offset = 0; ; offset += PAGE) {
        const page = await entries.list(name, { stage: 'published', limit: PAGE, offset, ...locale ? { locale } : {} })
        for (const e of page.items) {
          // a locale's list may fill a missing version from a fallback locale: only its own versions count
          if (e.path && !noindex(e.data) && (!locale || e.locale === locale))
            pages.push({ id: e.id, path: e.path, locale: e.locale, updatedAt: e.updatedAt, translations: e.translations })
        }
        if (offset + PAGE >= page.total)
          break
      }
    }
    const byId = new Map(pages.map(p => [p.id, p]))
    for (const p of pages) {
      const alternatives = Object.entries(p.translations ?? {})
        .map(([locale, id]) => [locale, byId.get(id)] as const)
        .filter((pair): pair is readonly [string, (typeof pages)[number]] => !!pair[1])
        .map(([locale, other]) => ({ hreflang: locale, href: url(other.path, locale) }))
      urls.push({ loc: url(p.path, p.locale), lastmod: p.updatedAt, ...alternatives.length > 1 ? { alternatives } : {} })
    }
  }
  for (const [name, definition] of Object.entries(singletons)) {
    if (!definition.route || !policy.can(visitor, 'read', name))
      continue
    const singleton = await entries.getSingleton(name, { stage: 'published' })
    if (singleton?.path && singleton.publishedVersion !== null && !noindex(singleton.data))
      urls.push({ loc: singleton.path, lastmod: singleton.updatedAt })
  }
  return urls
}
