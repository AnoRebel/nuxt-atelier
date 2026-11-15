import type { AtelierDriver } from '../../packages/core/src/runtime/server/db/driver'
import type { EntryStore } from '../../packages/core/src/runtime/server/db/store'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createEntryStore, ValidationError } from '../../packages/core/src/runtime/server/db/store'
import * as f from '../../packages/core/src/runtime/shared/fields'
import { connectEngine, createTables, engines, resetDatabase } from './env'

const schema = {
  locales: { codes: ['en', 'de', 'de-at', 'fr'], fallback: { 'de-at': ['de'] } },
  collections: {
    products: {
      localized: true,
      route: { pattern: '/products/{slug}' },
      fields: {
        slug: f.slug({ required: true, unique: true }),
        title: f.text({ required: true }),
        subtitle: f.text(),
        sku: f.text({ shared: true }),
      },
    },
    news: { localized: true, versioned: true, fields: { title: f.text(), code: f.text({ shared: true }) } },
    plain: { fields: { title: f.text() } },
    // one block structure in every locale; and each locale its own blocks
    pages: { localized: { blocks: 'shared' as const }, fields: { title: f.text(), content: f.blocks() } },
    posts: { localized: true, fields: { content: f.blocks() } },
  },
  singletons: {
    home: {
      localized: true,
      versioned: true,
      route: { pattern: { 'en': '/', 'de': '/de', 'de-at': '/de-at', 'fr': '/fr' } },
      fields: { title: f.text(), tagline: f.text(), code: f.text({ shared: true }) },
    },
  },
  blocks: {
    text: { name: 'text', fields: { body: f.text(), anchor: f.text({ shared: true }) }, options: { tone: f.select({ options: ['plain', 'loud'] }) }, areas: {} },
    columns: { name: 'columns', fields: {}, options: {}, areas: { items: {} } },
  },
}
const schemaFile = join(mkdtempSync(join(tmpdir(), 'atelier-localized-')), 'schema.json')
writeFileSync(schemaFile, JSON.stringify(schema))

describe.each(engines)('%s localized entries', (_, url) => {
  let driver: AtelierDriver
  let store: EntryStore

  beforeAll(async () => {
    driver = await connectEngine(url)
    await resetDatabase(driver)
    await createTables(driver, url, schemaFile)
    store = createEntryStore(driver, schema)
  }, 120_000)
  afterAll(() => driver?.close())

  it('links translations, and lists one locale at a time', async () => {
    const en = await store.save('products', { data: { slug: 'chair', title: 'Chair', subtitle: 'Sit down', sku: 'C-1' } })
    expect(en).toMatchObject({ locale: 'en', translations: { en: en.id }, path: '/products/chair' })
    const de = await store.save('products', { data: { slug: 'chair', title: 'Stuhl', sku: 'C-1' }, locale: 'de', translationOf: en.id })
    expect(de).toMatchObject({ locale: 'de', translations: { en: en.id, de: de.id } })
    expect((await store.get('products', en.id))!.translations).toEqual({ en: en.id, de: de.id })
    // the same slug and path in two locales
    expect((await store.resolve('/products/chair', 'de'))!.id).toBe(de.id)
    expect((await store.resolve('/products/chair', 'en'))!.id).toBe(en.id)
    expect((await store.list('products', {})).items.map(e => e.id)).toEqual([en.id])
    expect((await store.list('products', { locale: 'de' })).items.map(e => e.id)).toEqual([de.id])
  })

  it('refuses a second version in one locale, an unknown locale, and locales on a collection that isn\'t localized', async () => {
    const en = await store.save('products', { data: { slug: 'desk', title: 'Desk' } })
    await store.save('products', { data: { slug: 'tisch', title: 'Tisch' }, locale: 'de', translationOf: en.id })
    await expect(store.save('products', { data: { slug: 'tisch2', title: 'Tisch' }, locale: 'de', translationOf: en.id })).rejects.toThrow(/already has a de version/)
    await expect(store.save('products', { data: { slug: 'x', title: 'X' }, locale: 'xx' })).rejects.toBeInstanceOf(ValidationError)
    await expect(store.save('plain', { data: { title: 'X' }, locale: 'de' })).rejects.toThrow(/isn't localized/)
    // unique within a locale
    await expect(store.save('products', { data: { slug: 'desk', title: 'Again' } })).rejects.toBeInstanceOf(ValidationError)
  })

  it('changes a shared field in every locale', async () => {
    const en = await store.save('products', { data: { slug: 'lamp', title: 'Lamp', sku: 'L-1' } })
    const de = await store.save('products', { data: { slug: 'lampe', title: 'Lampe', sku: 'L-1' }, locale: 'de', translationOf: en.id })
    const fr = await store.save('products', { data: { slug: 'lampe', title: 'Lampe', sku: 'L-1' }, locale: 'fr', translationOf: de.id })
    await store.save('products', { id: de.id, version: de.version, data: { ...de.data, sku: 'L-2', title: 'Leuchte' } })
    const [enNow, frNow] = [await store.get('products', en.id), await store.get('products', fr.id)]
    expect(enNow).toMatchObject({ version: 2, data: { sku: 'L-2', title: 'Lamp' } })
    expect(frNow).toMatchObject({ version: 2, data: { sku: 'L-2', title: 'Lampe' } })
    expect((await store.revisions('products', en.id)).map(r => r.version)).toEqual([2, 1])
  })

  it('shares fields into drafts only, in a versioned type', async () => {
    const en = await store.save('news', { data: { title: 'Hello', code: 'A' }, publish: true })
    const de = await store.save('news', { data: { title: 'Hallo', code: 'A' }, locale: 'de', translationOf: en.id, publish: true })
    await store.save('news', { id: de.id, version: de.version, data: { ...de.data, code: 'B' } })
    expect((await store.get('news', en.id, { stage: 'draft' }))!.data.code).toBe('B')
    expect((await store.get('news', en.id))!.data.code).toBe('A')
  })

  it('falls back to another locale, saying which fields came from where', async () => {
    const en = await store.save('products', { data: { slug: 'sofa', title: 'Sofa', subtitle: 'Comfy' } })
    const de = await store.save('products', { data: { slug: 'sofa', title: 'Sofa (de)' }, locale: 'de', translationOf: en.id })
    // de-at → de → en: the German version, its subtitle from English
    const atRead = await store.get('products', en.id, { locale: 'de-at' })
    expect(atRead).toMatchObject({ id: de.id, locale: 'de', data: { title: 'Sofa (de)', subtitle: 'Comfy' }, fallbacks: { subtitle: 'en' } })
    // no French version: the English one
    expect(await store.get('products', de.id, { locale: 'fr' })).toMatchObject({ id: en.id, locale: 'en', fallbacks: {} })
    const page = await store.list('products', { locale: 'de', filter: { slug: { eq: 'sofa' } } })
    expect(page.items[0]).toMatchObject({ id: de.id, data: { subtitle: 'Comfy' }, fallbacks: { subtitle: 'en' } })
    // without a locale, as stored (what editors work on)
    expect((await store.get('products', de.id))!.data.subtitle).toBeNull()
  })

  it('keeps one block structure across locales, with translated text', async () => {
    const block = (id: string, body: string, extra: Record<string, unknown> = {}) => ({ id, type: 'text', props: { body, anchor: id, tone: 'plain', ...extra } })
    const en = await store.save('pages', { data: { title: 'Home', content: [block('a', 'Hello'), { id: 'c', type: 'columns', props: { items: [block('b', 'Left')] } }] } })
    const de = await store.save('pages', { data: { title: 'Start', content: [block('a', 'Hallo'), { id: 'c', type: 'columns', props: { items: [block('b', 'Links')] } }] }, locale: 'de', translationOf: en.id })
    // English: move b out of the columns to the top, make a loud, rename b's anchor, add d
    await store.save('pages', { id: en.id, version: en.version, data: { title: 'Home', content: [
      block('b', 'Left', { anchor: 'left' }),
      block('a', 'Hello', { tone: 'loud' }),
      { id: 'c', type: 'columns', props: { items: [block('d', 'New')] } },
    ] } })
    const german = (await store.get('pages', de.id))!.data
    expect(german.title).toBe('Start')
    expect(german.content).toEqual([
      block('b', 'Links', { anchor: 'left' }), // moved, its text kept, its shared anchor followed
      block('a', 'Hallo', { tone: 'loud' }), // options follow the structure
      { id: 'c', type: 'columns', props: { items: [block('d', 'New')] } }, // new: English text, to translate
    ])
  })

  it('keeps each locale\'s own blocks by default', async () => {
    const en = await store.save('posts', { data: { content: [{ id: 'a', type: 'text', props: { body: 'Hi' } }] } })
    const de = await store.save('posts', { data: { content: [] }, locale: 'de', translationOf: en.id })
    await store.save('posts', { id: en.id, version: en.version, data: { content: [{ id: 'z', type: 'text', props: { body: 'New' } }] } })
    expect((await store.get('posts', de.id))!).toMatchObject({ version: 1, data: { content: null } })
  })

  it('deletes one translation, keeping the others linked', async () => {
    const en = await store.save('products', { data: { slug: 'bed', title: 'Bed' } })
    const de = await store.save('products', { data: { slug: 'bett', title: 'Bett' }, locale: 'de', translationOf: en.id })
    const fr = await store.save('products', { data: { slug: 'lit', title: 'Lit' }, locale: 'fr', translationOf: en.id })
    await store.delete('products', en.id)
    expect((await store.get('products', fr.id))!.translations).toEqual({ de: de.id, fr: fr.id })
  })

  it('keeps a localized singleton\'s version per locale, with fallbacks, shared fields, URLs and history', async () => {
    const en = await store.saveSingleton('home', { data: { title: 'Home', tagline: 'Welcome', code: 'H1' }, publish: true })
    expect(en).toMatchObject({ locale: 'en', version: 1, path: '/' })
    const de = await store.saveSingleton('home', { data: { title: 'Start', code: 'H1' }, locale: 'de', publish: true })
    expect(de).toMatchObject({ locale: 'de', version: 1, path: '/de' })

    // read in a locale: its own, empty translated fields from the fallback chain, saying from where
    expect(await store.getSingleton('home', { locale: 'de' })).toMatchObject({ locale: 'de', data: { title: 'Start', tagline: 'Welcome' }, fallbacks: { tagline: 'en' } })
    expect(await store.getSingleton('home', { locale: 'de-at' })).toMatchObject({ locale: 'de', data: { title: 'Start' } }) // de-at → de
    expect(await store.getSingleton('home', { locale: 'de-at', fallback: false })).toBeUndefined()
    expect((await store.getSingleton('home'))!.data.title).toBe('Home') // the default locale
    await expect(store.getSingleton('home', { locale: 'xx' })).rejects.toBeInstanceOf(ValidationError)

    // each locale at its own URL
    expect(await store.resolve('/de', 'de')).toMatchObject({ kind: 'singleton', name: 'home' })
    expect(await store.resolve('/', 'en')).toMatchObject({ kind: 'singleton', name: 'home' })

    // a shared field goes to the other locales' drafts; what's published stays until they're published
    await store.saveSingleton('home', { data: { title: 'Home', tagline: 'Welcome', code: 'H2' }, version: 1, publish: true })
    expect(await store.getSingleton('home', { locale: 'de', stage: 'draft' })).toMatchObject({ version: 2, data: { title: 'Start', code: 'H2' } })
    expect((await store.getSingleton('home', { locale: 'de' }))!.data.code).toBe('H1')

    // history per locale
    expect((await store.revisions('home')).map(r => r.version)).toEqual([2, 1])
    expect((await store.revisions('home', 'de')).map(r => r.version)).toEqual([2, 1])
    expect((await store.revisions('home', 'de'))[1]!.data.title).toBe('Start')

    // published per locale; taken off one, that locale falls back again
    await store.publishSingleton('home', { version: 2, locale: 'de' })
    expect((await store.getSingleton('home', { locale: 'de' }))!.data.code).toBe('H2')
    await store.unpublishSingleton('home', null, 'de')
    expect(await store.getSingleton('home', { locale: 'de' })).toMatchObject({ locale: 'en', data: { title: 'Home' } })
    expect(await store.resolve('/de', 'de')).toBeUndefined()
    expect((await store.getSingleton('home', { locale: 'de', stage: 'draft' }))!.data.title).toBe('Start') // the draft stays
  })
})
