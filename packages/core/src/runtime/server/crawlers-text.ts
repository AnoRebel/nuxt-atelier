// The text crawlers get, without the server runtime: robots.txt groups and text, and sitemap XML.
import type { RobotsSettings } from './settings'

export interface RobotsGroup { userAgent: string[], allow: string[], disallow: string[] }
export interface SitemapUrl {
  loc: string
  lastmod: string
  alternatives?: { hreflang: string, href: string }[]
}

/** The robots groups: one per set of user agents, the `*` group first and always keeping out the admin and API. */
export function robotsGroups(settings: RobotsSettings, adminBase: string): RobotsGroup[] {
  const groups = new Map<string, RobotsGroup>([['*', { userAgent: ['*'], allow: [], disallow: [] }]])
  for (const rule of settings.rules) {
    const key = rule.userAgent.toSorted().join('\n')
    const group = groups.get(key) ?? groups.set(key, { userAgent: rule.userAgent, allow: [], disallow: [] }).get(key)!
    group.allow.push(...rule.allow)
    group.disallow.push(...rule.disallow)
  }
  // a crawler obeys only its own group: each keeps the admin and API out, and a site that isn't indexable
  // keeps everyone out of everything
  return [...groups.values()].map(g => settings.indexable
    ? { ...g, allow: [...new Set(g.allow)], disallow: [...new Set([adminBase, '/api/_atelier/', ...g.disallow])] }
    : { ...g, allow: [], disallow: ['/'] })
}

/** robots.txt text. */
export function robotsTxt(groups: RobotsGroup[], sitemap?: string): string {
  const blocks = groups.map(g => [
    ...g.userAgent.map(ua => `User-agent: ${ua}`),
    ...g.allow.map(p => `Allow: ${p}`),
    ...g.disallow.map(p => `Disallow: ${p}`),
    ...!g.allow.length && !g.disallow.length ? ['Disallow:'] : [],
  ].join('\n'))
  return `${[...blocks, ...sitemap ? [`Sitemap: ${sitemap}`] : []].join('\n\n')}\n`
}

const escape = (text: string) => text.replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '\'': '&apos;', '"': '&quot;' })[c]!)

/** A sitemap.xml of `urls`, made absolute against `origin`. */
export function sitemapXml(urls: SitemapUrl[], origin: string): string {
  const abs = (path: string) => /^https?:\/\//.test(path) ? path : `${origin.replace(/\/$/, '')}${path}`
  const body = urls.map(u => [
    '  <url>',
    `    <loc>${escape(abs(u.loc))}</loc>`,
    `    <lastmod>${escape(u.lastmod)}</lastmod>`,
    ...(u.alternatives ?? []).map(a => `    <xhtml:link rel="alternate" hreflang="${escape(a.hreflang)}" href="${escape(abs(a.href))}"/>`),
    '  </url>',
  ].join('\n')).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${body}\n</urlset>\n`
}
