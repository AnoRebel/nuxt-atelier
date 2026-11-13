// Sites: which site a host is, the fallback for unknown hosts, and the options' cross-checks.
import { describe, expect, it } from 'vitest'
import { resolveOptions } from '../../packages/core/src/options'
import { DEFAULT_SITE, siteForHost, siteNamed } from '../../packages/core/src/runtime/server/sites'

const list = { main: { hosts: ['example.com', 'www.example.com'] }, shop: { hosts: ['shop.example.com', 'localhost:4000'] } }

describe('sites', () => {
  it('finds a host\'s site, with or without its port, whatever its case', () => {
    expect(siteForHost({ list, fallback: null }, 'Shop.Example.com')).toBe('shop')
    expect(siteForHost({ list, fallback: null }, 'www.example.com:443')).toBe('main')
    expect(siteForHost({ list, fallback: null }, 'localhost:4000')).toBe('shop')
    expect(siteForHost({ list, fallback: null }, 'localhost:3000')).toBeUndefined()
  })

  it('serves unknown hosts with the fallback site, or nobody', () => {
    expect(siteForHost({ list, fallback: 'main' }, 'evil.example')).toBe('main')
    expect(siteForHost({ list, fallback: null }, 'evil.example')).toBeUndefined()
  })

  it('has one implicit site without sites', () => {
    expect(siteForHost({ list: null, fallback: null }, 'anything')).toBe(DEFAULT_SITE)
    expect(siteNamed({ list: null, fallback: null }, DEFAULT_SITE)).toEqual({ name: DEFAULT_SITE, scoped: false })
    expect(siteNamed({ list, fallback: null }, 'shop')).toEqual({ name: 'shop', scoped: true })
    expect(siteNamed({ list, fallback: null }, 'nope')).toBeUndefined()
  })

  it('checks the options: one site per host, a fallback that exists, site locales the CMS has', () => {
    expect(() => resolveOptions({ sites: { a: { hosts: ['x.test'] }, b: { hosts: ['x.test'] } } })).toThrow(/a host name belongs to one site only/)
    expect(() => resolveOptions({ sites: { a: { hosts: ['x.test'] } }, fallbackSite: 'b' })).toThrow(/fallbackSite = "b": expected one of the sites \(a\)/)
    expect(() => resolveOptions({ locales: { codes: ['en', 'de'] }, sites: { a: { hosts: ['x.test'], locales: ['fr'] } } })).toThrow(/sites\.a\.locales: "fr"/)
    expect(resolveOptions({ sites: { a: { hosts: ['X.test'] } }, fallbackSite: 'a' }).sites).toEqual({ a: { hosts: ['x.test'] } })
  })
})
