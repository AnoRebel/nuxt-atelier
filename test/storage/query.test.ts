import type { AtelierDriver } from '../../packages/core/src/runtime/server/db/driver'
import type { EntryStore } from '../../packages/core/src/runtime/server/db/store'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { QueryError } from '../../packages/core/src/runtime/server/db/query'
import { createEntryStore } from '../../packages/core/src/runtime/server/db/store'
import * as f from '../../packages/core/src/runtime/shared/fields'
import { connectEngine, createTables, engines, resetDatabase } from './env'

const schema = {
  collections: {
    articles: {
      fields: {
        title: f.text({ required: true }),
        category: f.select({ options: ['news', 'guides', 'opinion'] }),
        views: f.number({ integer: true }),
        published: f.date({ mode: 'datetime' }),
        featured: f.boolean(),
        tags: f.multiSelect({ options: ['vue', 'nuxt', 'cms'] }),
        author: f.relation({ to: 'authors' }),
        meta: f.json(),
      },
    },
    authors: { fields: { name: f.text() } },
  },
  singletons: {},
}
const schemaFile = join(mkdtempSync(join(tmpdir(), 'atelier-query-')), 'schema.json')
writeFileSync(schemaFile, JSON.stringify(schema))

const day = (n: number) => `2026-11-${String(n).padStart(2, '0')}T09:00:00.000Z`

describe.each(engines)('%s entry queries', (_, url) => {
  let driver: AtelierDriver
  let store: EntryStore
  let ada: string
  let linus: string
  const titles = async (query: Parameters<EntryStore['list']>[1]) => (await store.list('articles', query)).items.map(e => e.data.title)

  beforeAll(async () => {
    driver = await connectEngine(url)
    await resetDatabase(driver)
    await createTables(driver, url, schemaFile)
    store = createEntryStore(driver, schema)
    ada = (await store.save('authors', { data: { name: 'Ada' } })).id
    linus = (await store.save('authors', { data: { name: 'Linus' } })).id
    const rows: [string, string | null, number | null, number | null, string[], string | null][] = [
      ['Release notes', 'news', 120, 5, ['nuxt'], ada],
      ['Getting started', 'guides', 900, 1, ['nuxt', 'vue'], ada],
      ['Why a CMS', 'opinion', 40, 3, ['cms'], linus],
      ['Security update', 'news', 300, 7, [], linus],
      ['100% uptime', 'news', null, 2, [], null],
      ['Draft idea', null, 15, null, ['vue'], ada],
      ['Deploying', 'guides', 300, 4, ['nuxt'], null],
    ]
    for (const [title, category, views, published, tags, author] of rows)
      await store.save('articles', { authorId: author === ada ? 'user-ada' : undefined, data: { title, category, views, published: published && day(published), tags, author, featured: views !== null && views > 200 } })
  }, 120_000)
  afterAll(() => driver?.close())

  it('filters, sorts and populates: news by date, newest first, with the author embedded', async () => {
    const { items, total } = await store.list('articles', { filter: { category: { eq: 'news' } }, sort: ['-published'], depth: 1 })
    expect(total).toBe(3)
    expect(items.map(e => e.data.title)).toEqual(['Security update', 'Release notes', '100% uptime'])
    expect(items[0]!.data.author).toMatchObject({ id: linus, data: { name: 'Linus' } })
    expect(items[2]!.data.author).toBeNull()
  })

  it('compares, matches lists and nulls, and combines with and/or', async () => {
    expect(await titles({ filter: { views: { gte: 300 } }, sort: ['title'] })).toEqual(['Deploying', 'Getting started', 'Security update'])
    expect(await titles({ filter: { views: { gt: 40, lt: 300 } } })).toEqual(['Release notes'])
    expect(await titles({ filter: { category: { in: ['guides', 'opinion'] } }, sort: ['title'] })).toEqual(['Deploying', 'Getting started', 'Why a CMS'])
    expect(await titles({ filter: { category: { null: true } } })).toEqual(['Draft idea'])
    expect(await titles({ filter: { views: { ne: 300 }, featured: { eq: false } }, sort: ['title'] })).toEqual(['Draft idea', 'Release notes', 'Why a CMS'])
    expect(await titles({ filter: { or: [{ category: { eq: 'opinion' } }, { and: [{ category: { eq: 'guides' } }, { views: { lt: 500 } }] }] }, sort: ['title'] }))
      .toEqual(['Deploying', 'Why a CMS'])
    expect(await titles({ filter: { published: { lt: day(3) } }, sort: ['published'] })).toEqual(['Getting started', '100% uptime'])
  })

  it('matches text case-insensitively, with % and _ taken literally', async () => {
    expect(await titles({ filter: { title: { contains: 'UPDATE' } } })).toEqual(['Security update'])
    expect(await titles({ filter: { title: { contains: '0%' } } })).toEqual(['100% uptime'])
    expect(await titles({ filter: { title: { contains: '_' } } })).toEqual([])
  })

  it('filters multi-selects and relations', async () => {
    expect(await titles({ filter: { tags: { contains: 'vue' } }, sort: ['title'] })).toEqual(['Draft idea', 'Getting started'])
    expect(await titles({ filter: { author: { eq: linus } }, sort: ['title'] })).toEqual(['Security update', 'Why a CMS'])
    expect(await titles({ filter: { author: { in: [ada] }, views: { lt: 200 } }, sort: ['title'] })).toEqual(['Draft idea', 'Release notes'])
    expect(await titles({ filter: { author: { null: true } }, sort: ['title'] })).toEqual(['100% uptime', 'Deploying'])
    expect(await titles({ filter: { author: { ne: ada }, category: { eq: 'news' } }, sort: ['title'] })).toEqual(['100% uptime', 'Security update'])
  })

  it('sorts nulls last in both directions', async () => {
    expect((await titles({ sort: ['views'] })).at(-1)).toBe('100% uptime')
    expect((await titles({ sort: ['-views'] })).at(-1)).toBe('100% uptime')
    expect((await titles({ sort: ['-published'] })).at(-1)).toBe('Draft idea')
  })

  it('pages with a cursor through every entry exactly once, in order, and with an offset', async () => {
    const all = await titles({ sort: ['-views', 'title'], limit: 100 })
    const seen: unknown[] = []
    let cursor: string | undefined
    do {
      const page = await store.list('articles', { sort: ['-views', 'title'], limit: 2, cursor })
      expect(page.total).toBe(7)
      seen.push(...page.items.map(e => e.data.title))
      cursor = page.next ?? undefined
    } while (cursor)
    expect(seen).toEqual(all)
    expect(await titles({ sort: ['-views', 'title'], limit: 2, offset: 2 })).toEqual(all.slice(2, 4))
    await expect(store.list('articles', { sort: ['title'], cursor: 'garbage' })).rejects.toBeInstanceOf(QueryError)
  })

  it('limits to the entries a user created', async () => {
    expect(await titles({ createdBy: 'user-ada', sort: ['title'] })).toEqual(['Draft idea', 'Getting started', 'Release notes'])
  })

  it('refuses fields and operators a collection can\'t use, naming them', async () => {
    await expect(store.list('articles', { filter: { nope: { eq: 1 } } })).rejects.toThrow('Unknown field "nope"')
    await expect(store.list('articles', { filter: { views: { contains: '1' } } })).rejects.toThrow('views: contains works on text fields')
    await expect(store.list('articles', { filter: { meta: { eq: 'x' } } })).rejects.toThrow('meta: a json field can only be filtered with null')
    await expect(store.list('articles', { sort: ['meta'] })).rejects.toThrow('meta: a json field can\'t be sorted')
    await expect(store.list('articles', { filter: { views: { like: 1 } as never } })).rejects.toThrow('unknown operator "like"')
  })
})
