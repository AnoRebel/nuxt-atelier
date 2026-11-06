import type { AtelierDriver } from '../../packages/core/src/runtime/server/db/driver'
import type { EntryStore } from '../../packages/core/src/runtime/server/db/store'
import { execFile } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { connect } from '../../packages/core/src/runtime/server/db/driver'
import { ConflictError, createEntryStore, ValidationError } from '../../packages/core/src/runtime/server/db/store'
import * as f from '../../packages/core/src/runtime/shared/fields'
import { engines, query, resetDatabase } from './env'

const schema = {
  collections: {
    articles: {
      fields: {
        title: f.text({ required: true, unique: true }),
        tags: f.relation({ to: 'tags', many: true }),
        author: f.relation({ to: 'authors' }),
        faq: f.repeater({ fields: { q: f.text(), who: f.relation({ to: 'authors' }) } }),
      },
    },
  },
  singletons: {},
}
const schemaFile = join(mkdtempSync(join(tmpdir(), 'atelier-store-')), 'schema.json')
writeFileSync(schemaFile, JSON.stringify(schema))
const pushScript = fileURLToPath(new URL('./push.ts', import.meta.url))

describe.each(engines)('%s entry store', (_, url) => {
  let driver: AtelierDriver
  let store: EntryStore
  const relationsOf = async (id: string) => (await query(driver, sql`select field, position, target, target_id from atelier_relations where source_id = ${id} order by field, position`))
    .map(r => `${r.field}[${r.position}] → ${r.target}/${r.target_id}`)

  beforeAll(async () => {
    driver = await connect(url)
    await resetDatabase(driver)
    await promisify(execFile)('bun', [pushScript, driver.dialect, url, schemaFile])
    store = createEntryStore(driver, schema)
  }, 120_000)
  afterAll(() => driver?.close())

  it('creates an entry with its relations and a first revision', async () => {
    const entry = await store.save('articles', { data: { title: 'Hello', tags: ['t1', 't2'], author: 'a1', faq: [{ q: 'Why?', who: 'a2' }] } })
    expect(entry).toMatchObject({ version: 1, data: { title: 'Hello', tags: ['t1', 't2'], author: 'a1', faq: [{ q: 'Why?', who: 'a2' }] } })
    expect(await relationsOf(entry.id)).toEqual(['author[0] → authors/a1', 'faq.0.who[0] → authors/a2', 'tags[0] → tags/t1', 'tags[1] → tags/t2'])
    expect((await store.revisions('articles', entry.id)).map(r => r.version)).toEqual([1])
  })

  it('updates against the version it read, replacing relations', async () => {
    const created = await store.save('articles', { data: { title: 'Draft', tags: ['t1'] } })
    const updated = await store.save('articles', { id: created.id, version: 1, data: { title: 'Final', tags: ['t3'] } })
    expect(updated).toMatchObject({ version: 2, data: { title: 'Final', tags: ['t3'], author: null } })
    expect(await relationsOf(created.id)).toEqual(['tags[0] → tags/t3'])
    expect((await store.revisions('articles', created.id)).map(r => [r.version, r.data.title])).toEqual([[2, 'Final'], [1, 'Draft']])
  })

  it('refuses a stale save with 409 and the current version, keeping the newer data', async () => {
    const { id } = await store.save('articles', { data: { title: 'Shared' } })
    await store.save('articles', { id, version: 1, data: { title: 'First save wins' } })
    const stale = store.save('articles', { id, version: 1, data: { title: 'Second save' } })
    await expect(stale).rejects.toBeInstanceOf(ConflictError)
    await expect(stale).rejects.toMatchObject({ statusCode: 409, data: { currentVersion: 2 } })
    expect((await store.get('articles', id))!.data.title).toBe('First save wins')
  })

  it('lets exactly one of two concurrent saves of the same version through', async () => {
    const { id } = await store.save('articles', { data: { title: 'Race' } })
    const results = await Promise.allSettled([
      store.save('articles', { id, version: 1, data: { title: 'Race A' } }),
      store.save('articles', { id, version: 1, data: { title: 'Race B' } }),
    ])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect((await store.get('articles', id))!.version).toBe(2)
  })

  it('leaves no partial data when a save fails after writing some rows', async () => {
    const { id } = await store.save('articles', { data: { title: 'Before', tags: ['t1'] } })
    // a revision already holding version 2 makes the save fail on its last write, after the entry and relations
    await query(driver, sql`insert into atelier_revisions (_id, source, source_id, _version, data, _created_at) values ('blocker', 'articles', ${id}, 2, '{}', 'now')`)
    await expect(store.save('articles', { id, version: 1, data: { title: 'After', tags: ['t9'] } })).rejects.toThrow()
    expect(await store.get('articles', id)).toMatchObject({ version: 1, data: { title: 'Before', tags: ['t1'] } })
    expect(await relationsOf(id)).toEqual(['tags[0] → tags/t1'])
  })

  it('writes nothing for invalid data, with field errors (422)', async () => {
    await expect(store.save('articles', { data: { title: '' } })).rejects.toMatchObject({
      statusCode: 422,
      errors: [{ path: 'title', message: 'required' }],
    })
    const duplicate = store.save('articles', { data: { title: 'Hello' } })
    await expect(duplicate).rejects.toBeInstanceOf(ValidationError)
    await expect(duplicate).rejects.toMatchObject({ errors: [{ path: 'title', message: 'already used by another entry' }] })
  })
})
