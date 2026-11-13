// Site search on every engine: the same documents, the same queries, the same answers.
import type { SearchAdapter } from '../../packages/core/src/runtime/server/search/adapter'
import type { AtelierDriver } from '../../packages/core/src/runtime/server/db/driver'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDatabaseSearch } from '../../packages/core/src/runtime/server/search/adapter'
import { searchTableSql, searchText, terms } from '../../packages/core/src/runtime/server/search/text'
import * as f from '../../packages/core/src/runtime/shared/fields'
import { connectEngine, engines, query, resetDatabase } from './env'

const fields = {
  title: f.text({ searchable: 3 }),
  body: f.richText({ searchable: true }),
  content: f.blocks({ searchable: 2 }),
  internal: f.text(),
}
const doc = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })

describe('search text', () => {
  it('collects searchable text by weight, from rich text and blocks, leaving out the rest', () => {
    const text = searchText(fields, {
      title: 'Garden hose',
      body: doc('Waters the lawn'),
      content: [{ id: 'b1', type: 'quote', text: 'Green fingers', cite: { name: 'Ada' } }],
      internal: 'secret plans',
    })
    expect(text).toEqual({ a: 'Garden hose', b: 'Green fingers Ada', c: 'Waters the lawn' })
    expect(searchText(fields, { title: 'Hidden', body: doc('Shown') }, new Set(['title']))).toEqual({ a: '', b: '', c: 'Shown' })
  })

  it('turns any input into plain words', () => {
    expect(terms('  Garden "hose" -cheap  title:green* OR 1=1; DROP TABLE x; -- ')).toEqual(['garden', 'hose', 'cheap', 'title', 'green', 'or', '1', 'drop', 'table', 'x'])
    expect(terms('x'.repeat(500))).toEqual(['x'.repeat(64)])
  })
})

describe.each(engines)('%s search', (_, url) => {
  let driver: AtelierDriver
  let search: SearchAdapter
  const find = (text: string, options: { types?: string[], locale?: string } = {}) =>
    search.search({ terms: terms(text), types: options.types ?? ['posts', 'pages'], locale: options.locale, limit: 10, offset: 0 })

  beforeAll(async () => {
    driver = await connectEngine(url)
    await resetDatabase(driver)
    for (const statement of searchTableSql(driver.dialect))
      await query(driver, sql.raw(statement))
    search = createDatabaseSearch(driver)
    await search.index({ type: 'posts', id: 'p1', locale: '', a: 'Gardening notes', b: '', c: 'Winter is coming for the roses' })
    await search.index({ type: 'posts', id: 'p2', locale: '', a: 'Spring', b: '', c: 'Notes from the gardening club, <script>alert(1)</script> included' })
    await search.index({ type: 'pages', id: 'g1', locale: 'en', a: 'About the gardening club', b: '', c: '' })
    await search.index({ type: 'pages', id: 'g2', locale: 'de', a: 'Über den Gartenverein', b: '', c: 'gardening auf Deutsch' })
  }, 120_000)
  afterAll(() => driver?.close())

  it('ranks a title match above a body match, with the same answer shape everywhere', async () => {
    const { hits, total } = await find('gardening notes', { types: ['posts'] })
    expect(total).toBe(2)
    expect(hits.map(h => h.id)).toEqual(['p1', 'p2'])
    expect(hits[0]).toEqual({ type: 'posts', id: 'p1', locale: '', score: expect.any(Number), excerpt: expect.stringContaining('<mark>') })
  })

  it('matches the last word as a prefix, filters by type and locale', async () => {
    expect((await find('garden', { types: ['posts'] })).hits.map(h => h.id).toSorted()).toEqual(['p1', 'p2'])
    expect((await find('gardening', { types: ['pages'], locale: 'de' })).hits.map(h => h.id)).toEqual(['g2'])
    expect((await find('gardening', { types: ['pages'] })).hits.map(h => h.id).toSorted()).toEqual(['g1', 'g2'])
  })

  it('escapes the text around matches', async () => {
    const [hit] = (await find('club', { types: ['posts'] })).hits
    expect(hit!.excerpt).not.toContain('<script>')
    expect(hit!.excerpt).toContain('&lt;script&gt;')
  })

  it('treats operators and SQL as plain words: no error, nothing leaked', async () => {
    for (const input of ['gardening" OR 1=1 --', '\'; DROP TABLE atelier_search; --', 'gardening NOT notes', 'title:gard*', '"', '-', '+++', '()', '*'])
      await expect(find(input)).resolves.toHaveProperty('hits')
    expect((await find('nothingmatchesthis')).total).toBe(0)
    expect((await find('roses')).total).toBe(1) // the table's still there
  })

  it('replaces and removes documents', async () => {
    await search.index({ type: 'posts', id: 'p1', locale: '', a: 'Kitchen notes', b: '', c: '' })
    expect((await find('roses')).total).toBe(0)
    await search.remove('posts', 'p2')
    expect((await find('club', { types: ['posts'] })).total).toBe(0)
    await search.clear('pages')
    expect((await find('gardening')).total).toBe(0)
  })
})
