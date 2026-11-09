import { describe, expect, it } from 'vitest'
import { buildTables } from '../../packages/core/src/runtime/server/db/tables'
import { canonicalPath, entryPaths, presentPaths } from '../../packages/core/src/runtime/server/routes'
import * as f from '../../packages/core/src/runtime/shared/fields'

const fields = { title: f.text({ required: true }), slug: f.slug({ required: true }), note: f.text(), body: f.richText(), at: f.date({ required: true, mode: 'datetime' }) }
const build = (pattern: string | Record<string, string>) => () => buildTables('sqlite', { singletons: {}, collections: { pages: { route: { pattern }, fields } } })

describe('route patterns', () => {
  it('accepts fixed, placeholder and per-locale patterns', () => {
    for (const pattern of ['/', '/{slug}', '/blog/{slug}', '/a/{title}-{slug}.html', { 'en': '/projects/{slug}', 'pt-br': '/projetos/{slug}' }])
      expect(build(pattern)).not.toThrow()
  })

  it('refuses malformed patterns, reserved paths and placeholders that aren\'t required top-level path fields', () => {
    expect(build('blog/{slug}')).toThrow('pages: route.pattern "blog/{slug}" must start with "/"')
    expect(build('/blog/')).toThrow('without "//" or a trailing "/"')
    expect(build('//{slug}')).toThrow('without "//" or a trailing "/"')
    expect(build('/api/{slug}')).toThrow('is under a path Nuxt serves itself')
    expect(build('/_nuxt/{slug}')).toThrow('is under a path Nuxt serves itself')
    expect(build('/a b/{slug}')).toThrow('"a b" may only hold')
    expect(build('/{note}')).toThrow('{note} must be a required top-level')
    expect(build('/{body}')).toThrow('{body} must be a required top-level')
    expect(build('/{at}')).toThrow('{at} must be a required top-level')
    expect(build('/{missing}')).toThrow('{missing} must be a required top-level')
    expect(build({ english: '/{slug}' })).toThrow('route.pattern.english: "english" isn\'t a locale code')
    expect(build({})).toThrow('route.pattern has no locales')
  })
})

describe('entry paths', () => {
  it('fills placeholders, encoding each value as one segment, and gives no path while a value is empty', () => {
    expect(entryPaths({ pattern: '/blog/{slug}' }, { slug: 'hello' })).toEqual([{ locale: '', path: '/blog/hello' }])
    expect(entryPaths({ pattern: '/t/{title}' }, { title: 'a/b c' })).toEqual([{ locale: '', path: '/t/a%2Fb%20c' }])
    expect(entryPaths({ pattern: { en: '/p/{slug}', et: '/e/{slug}' } }, { slug: 'x' })).toEqual([{ locale: 'en', path: '/p/x' }, { locale: 'et', path: '/e/x' }])
    expect(entryPaths({ pattern: '/{slug}' }, { slug: '' })).toEqual([])
  })

  it('canonicalises request paths, refusing protocol-relative and malformed ones', () => {
    expect(canonicalPath('/t/a%2fb%20c')).toBe('/t/a%2Fb%20c')
    expect(canonicalPath('/café/')).toBe('/caf%C3%A9')
    expect(canonicalPath('/')).toBe('/')
    expect(canonicalPath('//evil.example')).toBeUndefined()
    expect(canonicalPath('/%E0%A4%A')).toBeUndefined()
    expect(canonicalPath(`/${'a'.repeat(300)}`)).toBeUndefined()
  })

  it('presents the path in the read locale, the first pattern\'s by default', () => {
    const route = { pattern: { en: '/p/{slug}', et: '/e/{slug}' } }
    const stored = [{ locale: 'et', path: '/e/x' }, { locale: 'en', path: '/p/x' }]
    expect(presentPaths(route, stored)).toEqual({ path: '/p/x', paths: { et: '/e/x', en: '/p/x' } })
    expect(presentPaths(route, stored, 'et').path).toBe('/e/x')
    expect(presentPaths({ pattern: '/{slug}' }, [])).toEqual({ path: null })
  })
})

describe('nested routes', () => {
  const sections = (route: object, parent: f.Field = f.relation({ to: 'sections' })) => () =>
    buildTables('sqlite', { singletons: {}, collections: { sections: { route: { pattern: '/{slug}', ...route }, fields: { slug: f.slug({ required: true }), parent } } } })

  it('takes a parent relation to the same collection holding one entry', () => {
    expect(sections({ parent: 'parent' })).not.toThrow()
    expect(sections({ parent: 'parent' }, f.relation({ to: 'sections', many: true }))).toThrow('route.parent "parent" must be a top-level relation to "sections" holding one entry')
    expect(sections({ parent: 'slug' })).toThrow('route.parent "slug" must be')
    expect(() => buildTables('sqlite', { collections: {}, singletons: { home: { route: { pattern: '/', parent: 'x' }, fields: {} } } }))
      .toThrow('home: route.parent: a singleton has no parent')
  })
})
