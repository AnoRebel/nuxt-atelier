import type { AtelierDriver } from '../../packages/core/src/runtime/server/db/driver'
import type { EntryStore, LifecycleHook } from '../../packages/core/src/runtime/server/db/store'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createEntryStore, ValidationError } from '../../packages/core/src/runtime/server/db/store'
import * as f from '../../packages/core/src/runtime/shared/fields'
import { connectEngine, createTables, engines, resetDatabase } from './env'

const schema = {
  collections: { posts: { versioned: true, fields: { title: f.text({ required: true }), slug: f.text() } } },
  singletons: { settings: { fields: { name: f.text() } } },
}
const schemaFile = join(mkdtempSync(join(tmpdir(), 'atelier-hooks-')), 'schema.json')
writeFileSync(schemaFile, JSON.stringify(schema))

describe.each(engines)('%s lifecycle hooks', (_, url) => {
  let driver: AtelierDriver
  let store: EntryStore
  let calls: string[] = []
  let failures: [LifecycleHook, string][] = []
  let handlers: Partial<Record<LifecycleHook, (context: any) => unknown>> = {}

  beforeAll(async () => {
    driver = await connectEngine(url)
    await resetDatabase(driver)
    await createTables(driver, url, schemaFile)
    store = createEntryStore(driver, schema, {
      hooks: async (hook, context) => {
        calls.push(hook)
        await handlers[hook]?.(context)
      },
      onHookError: (hook, _, error) => void failures.push([hook, (error as Error).message]),
    })
  }, 120_000)
  afterAll(() => driver?.close())
  beforeEach(() => {
    calls = []
    failures = []
    handlers = {}
  })

  it('runs the hooks of a save around it, in order, with the data a before-hook changed', async () => {
    handlers.beforeCreate = (context) => {
      context.data.slug = String(context.data.title).toLowerCase().replaceAll(' ', '-')
    }
    const post = await store.save('posts', { data: { title: 'Hello World' }, publish: true, authorId: 'u1' })
    expect(post.data.slug).toBe('hello-world')
    expect(calls).toEqual(['beforeCreate', 'beforePublish', 'afterCreate', 'afterPublish'])

    calls = []
    await store.save('posts', { id: post.id, version: post.version, data: { title: 'Hi' } })
    await store.unpublish('posts', post.id, 'u1')
    await store.delete('posts', post.id, 'u1')
    expect(calls).toEqual(['beforeUpdate', 'afterUpdate', 'beforeUnpublish', 'afterUnpublish', 'beforeDelete', 'afterDelete'])
  })

  it('stops the operation when a before-hook throws: nothing is written, the caller gets the error', async () => {
    handlers.beforeCreate = (context) => {
      if (context.data.title === 'Spam')
        throw new ValidationError([{ path: 'title', message: 'looks like spam' }])
    }
    await expect(store.save('posts', { data: { title: 'Spam' } })).rejects.toMatchObject({ statusCode: 422, errors: [{ path: 'title', message: 'looks like spam' }] })
    expect((await store.list('posts', { stage: 'draft' })).items.filter(p => p.data.title === 'Spam')).toEqual([])
    expect(calls).not.toContain('afterCreate')

    const post = await store.save('posts', { data: { title: 'Kept' }, publish: true })
    handlers.beforeDelete = () => {
      throw new Error('not today')
    }
    await expect(store.delete('posts', post.id)).rejects.toThrow('not today')
    expect(await store.get('posts', post.id)).toBeDefined()
  })

  it('keeps a write whose after-hook fails, and reports the failure', async () => {
    handlers.afterPublish = () => {
      throw new Error('the CDN is down')
    }
    const post = await store.save('posts', { data: { title: 'Published anyway' } })
    const published = await store.publish('posts', post.id, { version: 1 })
    expect(published.publishedVersion).toBe(2)
    expect(await store.get('posts', post.id)).toMatchObject({ data: { title: 'Published anyway' } })
    expect(failures).toEqual([['afterPublish', 'the CDN is down']])
  })

  it('lets read hooks refuse a read or change what it returns', async () => {
    await store.saveSingleton('settings', { data: { name: 'Atelier' } })
    handlers.afterRead = (context) => {
      for (const entry of context.entries)
        entry.data.shout = String(entry.data.name ?? entry.data.title).toUpperCase()
    }
    expect((await store.getSingleton('settings'))!.data.shout).toBe('ATELIER')
    expect((await store.list('posts', {})).items.every(p => p.data.shout === String(p.data.title).toUpperCase())).toBe(true)

    handlers.beforeRead = (context) => {
      if (context.stage === 'draft')
        throw new Error('drafts are closed today')
    }
    await expect(store.getSingleton('settings', { stage: 'draft' })).rejects.toThrow('drafts are closed today')
    expect(calls.filter(c => c === 'beforeRead').length).toBeGreaterThan(0)
  })
})
