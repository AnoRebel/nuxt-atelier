// Which site a request is for. With `sites` configured, the `Host` header picks it (the fallback site
// serving unknown hosts, else 404); signed-in tools can name another with `x-atelier-site`, which access
// checks then judge. Without `sites`, every request is for the one implicit site, `default`.
import type { RequestEvent } from 'nuxt/server'
import { getRequestHeader, getRequestHost } from 'nuxt/server'

/** The site a data access is for: required by every site-scoped store, so leaving it out doesn't compile. */
export interface SiteContext {
  readonly name: string
  /** Whether sites are configured at all: without them, nothing is scoped (no `_site` columns). */
  readonly scoped: boolean
}

export interface SiteDefinition { hosts: string[], label?: string, locales?: string[], defaultLocale?: string }
export interface SitesConfig { list: Record<string, SiteDefinition> | null, fallback: string | null }

/** The name of the one site an app without `sites` has. */
export const DEFAULT_SITE = 'default'
/** The one site of an install without `sites`. */
export const singleSite: SiteContext = Object.freeze({ name: DEFAULT_SITE, scoped: false })

/** The site serving `host` (`shop.example.com`, a port allowed), or undefined. */
export function siteForHost(config: SitesConfig, host: string): string | undefined {
  if (!config.list)
    return DEFAULT_SITE
  const bare = host.toLowerCase().trim()
  const withoutPort = bare.replace(/:\d+$/, '')
  for (const [name, site] of Object.entries(config.list)) {
    if (site.hosts.includes(bare) || site.hosts.includes(withoutPort))
      return name
  }
  return config.fallback ?? undefined
}

/** A site by name, when it exists. */
export function siteNamed(config: SitesConfig, name: string): SiteContext | undefined {
  if (!config.list)
    return name === DEFAULT_SITE ? singleSite : undefined
  return config.list[name] ? { name, scoped: true } : undefined
}

interface SiteRequestContext { atelier?: { site?: SiteContext, hostSite?: SiteContext } }

/** Resolves the request's site from its host (the middleware); undefined: no site here. */
export function resolveRequestSite(event: RequestEvent, config: SitesConfig, trustProxy: boolean): SiteContext | undefined {
  const name = siteForHost(config, getRequestHost(event, { xForwardedHost: trustProxy }) ?? '')
  const site = name === undefined ? undefined : siteNamed(config, name)
  if (site) {
    const context = event.context as SiteRequestContext
    context.atelier = { ...context.atelier, site, hostSite: site }
  }
  return site
}

/**
 * The site a request is for: its host's, or the one an admin request names in `x-atelier-site`. Whether the
 * caller may act on that site is the access checks' business (see content-access.ts).
 */
export function siteOf(event: RequestEvent, config: SitesConfig): SiteContext {
  const context = event.context as SiteRequestContext
  const named = getRequestHeader(event, 'x-atelier-site')
  if (named && config.list) {
    const site = siteNamed(config, named)
    if (site)
      return site
  }
  return context.atelier?.site ?? singleSite
}
