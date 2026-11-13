import { describe, expect, it } from 'vitest'
import { robotsGroups, robotsTxt, sitemapXml } from '../../packages/core/src/runtime/server/crawlers-text'

describe('robots.txt', () => {
  it('keeps the admin and the CMS API out of every group, and merges rules per user agent', () => {
    const groups = robotsGroups({ indexable: true, rules: [
      { userAgent: ['*'], allow: [], disallow: ['/drafts'] },
      { userAgent: ['GPTBot'], allow: [], disallow: ['/'] },
      { userAgent: ['*'], allow: ['/drafts/public'], disallow: [] },
    ] }, '/studio')
    expect(groups).toEqual([
      { userAgent: ['*'], allow: ['/drafts/public'], disallow: ['/studio', '/api/_atelier/', '/drafts'] },
      { userAgent: ['GPTBot'], allow: [], disallow: ['/studio', '/api/_atelier/', '/'] },
    ])
    expect(robotsTxt(groups, 'https://example.com/sitemap.xml')).toBe(`User-agent: *
Allow: /drafts/public
Disallow: /studio
Disallow: /api/_atelier/
Disallow: /drafts

User-agent: GPTBot
Disallow: /studio
Disallow: /api/_atelier/
Disallow: /

Sitemap: https://example.com/sitemap.xml
`)
  })

  it('keeps every crawler out of everything when the site isn\'t indexable', () => {
    const groups = robotsGroups({ indexable: false, rules: [{ userAgent: ['Googlebot'], allow: ['/'], disallow: [] }] }, '/admin')
    expect(groups.every(g => g.disallow.join() === '/' && !g.allow.length)).toBe(true)
  })
})

describe('sitemap.xml', () => {
  it('lists URLs, absolute, escaped, with their alternates', () => {
    const xml = sitemapXml([
      { loc: '/a?x=1&y=2', lastmod: '2026-11-01T00:00:00Z' },
      { loc: '/en/chair', lastmod: '2026-11-02T00:00:00Z', alternatives: [{ hreflang: 'en', href: '/en/chair' }, { hreflang: 'de', href: '/de/stuhl' }] },
    ], 'https://example.com/')
    expect(xml).toContain('<loc>https://example.com/a?x=1&amp;y=2</loc>')
    expect(xml).toContain('<xhtml:link rel="alternate" hreflang="de" href="https://example.com/de/stuhl"/>')
    expect(xml.match(/<url>/g)).toHaveLength(2)
  })
})
