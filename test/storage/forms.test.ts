// Form submissions on every engine: listing, retention, and erasure by email with their files.
import type { AtelierDriver } from '../../packages/core/src/runtime/server/db/driver'
import type { SubmissionStore } from '../../packages/core/src/runtime/server/forms'
import type { StorageDriver } from '../../packages/core/src/runtime/server/media/storage'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createSubmissionStore } from '../../packages/core/src/runtime/server/forms'
import { connectEngine, createTables, engines, resetDatabase } from './env'

const schemaFile = join(mkdtempSync(join(tmpdir(), 'atelier-forms-')), 'schema.json')
writeFileSync(schemaFile, JSON.stringify({ collections: {}, singletons: {} }))

describe.each(engines)('%s form submissions', (_, url) => {
  let driver: AtelierDriver
  let store: SubmissionStore
  const deleted: string[] = []
  const storage = { name: 'memory', delete: async (key: string) => void deleted.push(key) } as unknown as StorageDriver
  const add = (form: string, data: Record<string, unknown>, emails: string[] = []) =>
    store.add({ id: crypto.randomUUID(), form, version: 1, locale: '', data, emails })

  beforeAll(async () => {
    driver = await connectEngine(url)
    await resetDatabase(driver)
    await createTables(driver, url, schemaFile)
    store = createSubmissionStore(driver, async () => storage)
  }, 120_000)
  afterAll(() => driver?.close())

  it('lists a form\'s submissions newest first, found by their text', async () => {
    await add('contact', { name: 'Ada', message: 'Hello' })
    await new Promise(resolve => setTimeout(resolve, 5))
    await add('contact', { name: 'Grace', message: 'Compilers' })
    await add('other', { name: 'Ada' })
    expect((await store.list('contact')).items.map(s => s.data.name)).toEqual(['Grace', 'Ada'])
    expect(await store.list('contact', { q: 'compil' })).toMatchObject({ total: 1, items: [{ data: { name: 'Grace' } }] })
    expect((await store.list('contact', { limit: 1, offset: 1 })).items.map(s => s.data.name)).toEqual(['Ada'])
  })

  it('deletes submissions past their form\'s retention, and only those', async () => {
    expect(await store.deleteBefore('contact', new Date(Date.now() - 90 * 24 * 3600_000))).toBe(0)
    expect(await store.deleteBefore('contact', new Date(Date.now() + 1000))).toBe(2)
    expect((await store.list('contact')).total).toBe(0)
    expect((await store.list('other')).total).toBe(1)
  })

  it('erases every submission with an email, of any form, files included', async () => {
    await add('contact', { email: 'jane@example.com', cv: { name: 'cv.pdf', type: 'application/pdf', size: 3, key: 'forms/s1/cv.pdf' } }, ['jane@example.com'])
    await add('newsletter', { email: 'Jane@Example.com' }, ['jane@example.com'])
    await add('newsletter', { email: 'janet@example.com' }, ['janet@example.com'])
    await add('newsletter', { email: 'jane_doe@example.com' }, ['jane_doe@example.com'])
    expect(await store.erase(' JANE@example.com')).toBe(2)
    expect(deleted).toContain('forms/s1/cv.pdf')
    expect((await store.list('newsletter')).items.map(s => s.data.email).toSorted()).toEqual(['jane_doe@example.com', 'janet@example.com'])
    expect(await store.erase('jane%@example.com')).toBe(0) // wildcards are plain characters
    expect(await store.erase('jane_doe@example.com')).toBe(1)
  })
})
