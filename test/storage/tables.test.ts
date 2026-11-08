import type { AtelierDriver } from '../../packages/core/src/runtime/server/db/driver'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fromRow, getRow, insertRow, isUnique, toRow } from '../../packages/core/src/runtime/server/db/entries'
import { buildTables, collectionTable, indexName } from '../../packages/core/src/runtime/server/db/tables'
import * as f from '../../packages/core/src/runtime/shared/fields'
import { connectEngine, createTables, engines, resetDatabase } from './env'

const fields = {
  title: f.text({ unique: true }),
  slug: f.slug({ unique: true, maxLength: 80 }),
  views: f.number({ integer: true }),
  rating: f.number(),
  published: f.boolean(),
  status: f.select({ options: ['draft', 'published'] }),
  publishedAt: f.date({ mode: 'datetime' }),
  color: f.color(),
  body: f.richText(),
  tags: f.multiSelect({ options: ['a', 'b'] }),
  meta: f.json(),
  faq: f.repeater({ fields: { q: f.text(), a: f.text() } }),
  author: f.relation({ to: 'authors' }),
}
const schema = { collections: { 'blog-posts': { fields }, 'authors': { fields: { name: f.text() } } }, singletons: { settings: { fields: { title: f.text() } } } }

const meta = (id: string) => ({ _id: id, _version: 1, _createdAt: '2026-11-03T10:00:00.000Z', _updatedAt: '2026-11-03T10:00:00.000Z' })
const full = {
  title: 'Hello',
  slug: 'hello',
  views: 2 ** 40, // beyond 32 bits
  rating: 4.25,
  published: true,
  status: 'published',
  publishedAt: '2026-11-03T09:30:00.000Z',
  color: '#ff8800',
  body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] }] },
  tags: ['a', 'b'],
  meta: { nested: { list: [1, 'two', null, true] }, s: 'plain' },
  faq: [{ q: 'Why?', a: 'Because' }],
}

const dir = mkdtempSync(join(tmpdir(), 'atelier-schema-'))
const schemaFile = join(dir, 'schema.json')
writeFileSync(schemaFile, JSON.stringify(schema))

describe.each(engines)('%s tables', (_, url) => {
  let driver: AtelierDriver
  let tables: Record<string, any>
  let posts: any

  beforeAll(async () => {
    driver = await connectEngine(url)
    await resetDatabase(driver)
    await createTables(driver, url, schemaFile)
    tables = buildTables(driver.dialect, schema)
    posts = tables[collectionTable('blog-posts')]
  }, 120_000)
  afterAll(() => driver?.close())
  const check = (id?: string) => ({ isUnique: (field: string, value: unknown) => isUnique(driver.db, posts, field, value, id) })

  it('creates the system and collection tables', () => {
    expect(Object.keys(tables).toSorted()).toEqual(['atelier_audit', 'atelier_c_authors', 'atelier_c_blog_posts', 'atelier_passkeys', 'atelier_rate_limits', 'atelier_relations', 'atelier_revisions', 'atelier_roles', 'atelier_routes', 'atelier_sessions', 'atelier_singletons', 'atelier_tokens', 'atelier_users'])
  })

  it('round-trips every column type unchanged', async () => {
    await insertRow(driver.db, posts, { ...meta('p1'), ...toRow(fields, { ...full, author: 'a1' }) })
    const row = await getRow(driver.db, posts, 'p1')
    expect(row).toMatchObject(meta('p1'))
    expect(fromRow(fields, row!)).toEqual(full)
  })

  it('round-trips JSON scalars, which some drivers return unparsed', async () => {
    for (const [i, value] of ['just text', '{"looks":"like json"}', 42, false].entries()) {
      await insertRow(driver.db, posts, { ...meta(`j${i}`), ...toRow(fields, { meta: value }) })
      expect(fromRow(fields, (await getRow(driver.db, posts, `j${i}`))!).meta).toEqual(value)
    }
  })

  it('stores empty values as NULL, so they never collide in a unique index', async () => {
    const empty = { title: '', slug: null, tags: [], meta: undefined }
    await insertRow(driver.db, posts, { ...meta('p2'), ...toRow(fields, empty) })
    await insertRow(driver.db, posts, { ...meta('p3'), ...toRow(fields, empty) })
    const data = fromRow(fields, (await getRow(driver.db, posts, 'p3'))!)
    expect(Object.values(data).every(v => v === null)).toBe(true)
  })

  it('enforces unique fields in the database and answers isUnique', async () => {
    await expect(insertRow(driver.db, posts, { ...meta('p4'), ...toRow(fields, { title: 'Hello' }) })).rejects.toThrow()
    expect(await isUnique(driver.db, posts, 'title', 'Hello')).toBe(false)
    expect(await isUnique(driver.db, posts, 'title', 'Hello', 'p1')).toBe(true) // the entry itself
    expect(await isUnique(driver.db, posts, 'title', 'Other')).toBe(true)
    expect(await isUnique(driver.db, posts, 'slug', 'hello')).toBe(false)
  })

  it('feeds validateEntry the database check', async () => {
    expect(await f.validateEntry(fields, { title: 'Hello' }, check())).toEqual({ success: false, errors: [{ path: 'title', message: 'already used by another entry' }] })
    expect((await f.validateEntry(fields, { title: 'Hello' }, check('p1'))).success).toBe(true)
  })
})

describe('table definitions', () => {
  it('rejects unique on fields that can\'t be indexed', () => {
    expect(() => buildTables('sqlite', { collections: { a: { fields: { body: f.richText({ unique: true }) } } }, singletons: {} }))
      .toThrow('a: field "body" can\'t be unique')
    expect(() => buildTables('sqlite', { collections: { a: { fields: { faq: f.repeater({ fields: { q: f.text({ unique: true }) } }) } } }, singletons: {} }))
      .toThrow('a.faq: field "q" can\'t be unique')
  })

  it('rejects field keys that aren\'t safe column names', () => {
    expect(() => buildTables('sqlite', { collections: { a: { fields: { _id: f.text() } } }, singletons: {} })).toThrow('field "_id" must be letters and digits')
  })

  it('rejects a name used by both a collection and a singleton', () => {
    expect(() => buildTables('sqlite', { collections: { home: { fields: {} } }, singletons: { home: { fields: {} } } })).toThrow('"home" is both a collection and a singleton')
  })

  it('keeps index names within the 63-character identifier limit', () => {
    const name = indexName(collectionTable('a'.repeat(50)), 'someVeryLongFieldName', 'unique')
    expect(name.length).toBe(63)
    expect(name).not.toBe(indexName(collectionTable('a'.repeat(50)), 'someVeryLongFieldNam2', 'unique'))
  })
})
