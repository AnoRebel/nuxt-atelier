import { describe, expect, it } from 'vitest'
import { adapterFrom, localePath, splitLocalePath } from '../../packages/core/src/runtime/shared/i18n'

describe('i18n adapter', () => {
  const adapter = adapterFrom('nuxt-i18n-micro', { locales: [{ code: 'en' }, { code: 'de' }], defaultLocale: 'en' })!

  it('reads either module\'s options, defaulting like they do', () => {
    expect(adapter).toEqual({ name: 'nuxt-i18n-micro', locales: ['en', 'de'], defaultLocale: 'en', strategy: 'prefix_except_default' })
    expect(adapterFrom('@nuxtjs/i18n', { locales: ['fr', 'it'], strategy: 'prefix' })).toMatchObject({ defaultLocale: 'fr', strategy: 'prefix' })
    expect(adapterFrom('@nuxtjs/i18n', { locales: [] })).toBeUndefined()
  })

  it('splits a locale prefix off a path', () => {
    expect(splitLocalePath(adapter, '/de/produkte/stuhl')).toEqual({ locale: 'de', path: '/produkte/stuhl' })
    expect(splitLocalePath(adapter, '/de')).toEqual({ locale: 'de', path: '/' })
    expect(splitLocalePath(adapter, '/deutsch/x')).toEqual({ locale: 'en', path: '/deutsch/x' })
    expect(splitLocalePath({ ...adapter, strategy: 'no_prefix' }, '/de/x')).toEqual({ locale: 'en', path: '/de/x' })
  })

  it('prefixes a path as the strategy wants', () => {
    expect(localePath(adapter, '/produkte/stuhl', 'de')).toBe('/de/produkte/stuhl')
    expect(localePath(adapter, '/products/chair', 'en')).toBe('/products/chair')
    expect(localePath({ ...adapter, strategy: 'prefix' }, '/', 'en')).toBe('/en')
    expect(localePath({ ...adapter, strategy: 'no_prefix' }, '/x', 'de')).toBe('/x')
  })
})
