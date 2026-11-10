// Reads stay bounded: the queries an entry read takes don't grow with its blocks or its relations. An N+1
// (a query per block, per related entry) makes the big entry's count differ from the small one's.
import type { AtelierDriver } from '../../packages/core/src/runtime/server/db/driver'
import type { EntryStore } from '../../packages/core/src/runtime/server/db/store'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createEntryStore } from '../../packages/core/src/runtime/server/db/store'
import * as f from '../../packages/core/src/runtime/shared/fields'
import { connectEngine, createTables, engines, resetDatabase } from './env'

const schema = {
  collections: {
    tags: { fields: { name: f.text() } },
    people: { fields: { name: f.text(), tags: f.relation({ to: 'tags', many: true }) } },
    pages: { route: { pattern: '/{slug}' }, fields: {
      slug: f.slug({ required: true }),
      tags: f.relation({ to: 'tags', many: true }),
      people: f.relation({ to: 'people', many: true }),
      content: f.blocks(),
    } },
  },
  singletons: {},
  blocks: { Card: { name: 'Card', fields: { title: f.text(), image: f.media() }, options: {}, areas: { items: {} } } },
}
const schemaFile = join(mkdtempSync(join(tmpdir(), 'atelier-queries-')), 'schema.json')
writeFileSync(schemaFile, JSON.stringify(schema))

describe.each(engines)('%s query count', (_, url) => {
  let driver: AtelierDriver
  let store: EntryStore
  let queries = 0

  beforeAll(async () => {
    driver = await connectEngine(url, { logQuery: () => void queries++ })
    await resetDatabase(driver)
    await createTables(driver, url, schemaFile)
    store = createEntryStore(driver, schema)
  }, 120_000)
  afterAll(() => driver?.close())

  /** A page with `blocks` blocks (half of them nested) and `relations` tags and people, each person tagged. */
  async function page(slug: string, blocks: number, relations: number) {
    const tags = await Promise.all(Array.from({ length: relations }, (_, i) => store.save('tags', { data: { name: `${slug}-${i}` } })))
    const people = await Promise.all(Array.from({ length: relations }, (_, i) => store.save('people', { data: { name: `${slug}-${i}`, tags: tags.map(t => t.id) } })))
    const content = Array.from({ length: blocks / 2 }, (_, i) => ({ id: `${slug}${i}`, type: 'Card', props: { title: `${i}`, items: [{ id: `${slug}${i}n`, type: 'Card', props: { title: 'nested' } }] } }))
    return store.save('pages', { data: { slug, tags: tags.map(t => t.id), people: people.map(p => p.id), content } })
  }
  const counted = async (read: () => Promise<unknown>) => {
    queries = 0
    await read()
    return queries
  }

  it('reads an entry with 200 blocks and 20 relations, two levels deep, in as many queries as a small one', async () => {
    const small = await page('small', 20, 2)
    const big = await page('big', 200, 20)
    const read = (id: string) => () => store.get('pages', id, { depth: 2 })
    const smallCount = await counted(read(small.id))
    const bigCount = await counted(read(big.id))
    expect(bigCount).toBe(smallCount)
    expect(bigCount).toBeLessThanOrEqual(12)
    // and a list of them, populated
    expect(await counted(() => store.list('pages', { depth: 2 }))).toBeLessThanOrEqual(14)
  })
})
