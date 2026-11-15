// Edit locks, presence, comments and notifications on every engine.
import type { AtelierDriver } from '../../packages/core/src/runtime/server/db/driver'
import type { CollabStore } from '../../packages/core/src/runtime/server/collab/store'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { blockIds, createCollabStore } from '../../packages/core/src/runtime/server/collab/store'
import { connectEngine, createTables, engines, resetDatabase } from './env'

const schemaFile = join(mkdtempSync(join(tmpdir(), 'atelier-collab-')), 'schema.json')
writeFileSync(schemaFile, JSON.stringify({ collections: {}, singletons: {} }))

describe('block ids', () => {
  it('finds blocks at any depth, and nothing else', () => {
    const data = { title: 'x', content: [{ id: 'b1', type: 'hero', props: { items: [{ id: 'b2', type: 'card' }] } }, { id: 'n', label: 'no type' }] }
    expect([...blockIds(data)].toSorted()).toEqual(['b1', 'b2'])
  })
})

describe.each(engines)('%s collaboration', (_, url) => {
  let driver: AtelierDriver
  let collab: CollabStore
  let short: CollabStore

  beforeAll(async () => {
    driver = await connectEngine(url)
    await resetDatabase(driver)
    await createTables(driver, url, schemaFile)
    collab = createCollabStore(driver, { lockTimeout: 60, presenceTimeout: 50 })
    // short, yet long enough for two calls on a busy CI runner (D1 in Miniflare among them)
    short = createCollabStore(driver, { lockTimeout: 1.5, presenceTimeout: 1.5 })
  }, 120_000)
  afterAll(() => driver?.close())

  it('locks an entry for one user, renews it for them, and refuses others', async () => {
    const first = await collab.acquire('posts', 'p1', 'ann')
    expect(first).toMatchObject({ granted: true, lock: { userId: 'ann' } })
    const renewed = await collab.acquire('posts', 'p1', 'ann')
    expect(renewed.granted).toBe(true)
    expect(renewed.lock.acquiredAt).toBe(first.lock.acquiredAt)
    expect(await collab.acquire('posts', 'p1', 'bob')).toMatchObject({ granted: false, lock: { userId: 'ann' } })
    expect(await collab.lockOf('posts', 'p1')).toMatchObject({ userId: 'ann' })
  })

  it('hands the lock over on takeover, naming whom it was taken from', async () => {
    const taken = await collab.acquire('posts', 'p1', 'bob', true)
    expect(taken).toMatchObject({ granted: true, takenFrom: 'ann', lock: { userId: 'bob' } })
    expect(await collab.release('posts', 'p1', 'ann')).toBe(false) // not hers anymore
    expect(await collab.release('posts', 'p1', 'bob')).toBe(true)
    expect(await collab.lockOf('posts', 'p1')).toBeNull()
  })

  it('frees an abandoned lock once it expires', async () => {
    await short.acquire('posts', 'p2', 'ann')
    expect(await short.acquire('posts', 'p2', 'bob')).toMatchObject({ granted: false })
    await new Promise(resolve => setTimeout(resolve, 1700))
    expect(await short.lockOf('posts', 'p2')).toBeNull()
    expect(await short.acquire('posts', 'p2', 'bob')).toMatchObject({ granted: true, lock: { userId: 'bob' } })
    expect((await short.acquire('posts', 'p2', 'bob')).takenFrom).toBeUndefined()
  })

  it('shows who has an entry open, until they leave or go quiet', async () => {
    await collab.touch('posts', 'p3', 'ann')
    await collab.touch('posts', 'p3', 'bob')
    await collab.touch('posts', 'p3', 'ann') // a heartbeat
    expect((await collab.viewers('posts', 'p3')).map(v => v.userId).toSorted()).toEqual(['ann', 'bob'])
    await collab.leave('posts', 'p3', 'bob')
    expect((await collab.viewers('posts', 'p3')).map(v => v.userId)).toEqual(['ann'])
    await new Promise(resolve => setTimeout(resolve, 1700))
    expect(await short.viewers('posts', 'p3')).toEqual([])
  })

  it('keeps threads of comments, resolved through their first comment', async () => {
    const root = await collab.addComment({ type: 'posts', entry: 'p4', block: 'b1', thread: null, author: 'ann', body: 'Shorter?', mentions: ['bob'] })
    const reply = await collab.addComment({ type: 'posts', entry: 'p4', block: 'b1', thread: root.id, author: 'bob', body: 'Done', mentions: [] })
    await collab.addComment({ type: 'posts', entry: 'p5', block: null, thread: null, author: 'ann', body: 'Elsewhere', mentions: [] })
    expect((await collab.comments('posts', 'p4')).map(c => c.body)).toEqual(['Shorter?', 'Done'])
    expect(await collab.comment(root.id)).toMatchObject({ mentions: ['bob'], block: 'b1', thread: null })
    await collab.editComment(reply.id, 'Done, thanks', [])
    await collab.resolve(root.id, 'ann')
    expect(await collab.comment(root.id)).toMatchObject({ resolvedBy: 'ann', resolvedAt: expect.any(String) })
    await collab.resolve(root.id, null)
    expect(await collab.comment(root.id)).toMatchObject({ resolvedBy: null, resolvedAt: null })
    expect((await collab.comment(reply.id))?.body).toBe('Done, thanks')
    await collab.deleteComment(root.id) // with its replies
    expect(await collab.comments('posts', 'p4')).toEqual([])
    await collab.deleteEntryComments('posts', 'p5')
    expect(await collab.comments('posts', 'p5')).toEqual([])
  })

  it('keeps each user\'s notifications, newest first, with an unread count', async () => {
    const one = await collab.notify('bob', 'mention', { type: 'posts', entry: 'p4', by: 'ann' })
    await new Promise(resolve => setTimeout(resolve, 5))
    await collab.notify('bob', 'reply', { type: 'posts', entry: 'p4', by: 'ann' })
    await collab.notify('ann', 'takeover', { type: 'posts', entry: 'p1', by: 'bob' })
    const bob = await collab.notifications('bob')
    expect(bob.unread).toBe(2)
    expect(bob.items.map(n => n.kind)).toEqual(['reply', 'mention'])
    expect(bob.items[1]).toMatchObject({ data: { type: 'posts', entry: 'p4', by: 'ann' }, readAt: null })
    await collab.markRead('bob', [one.id])
    expect((await collab.notifications('bob', { unread: true })).items.map(n => n.kind)).toEqual(['reply'])
    await collab.markRead('bob')
    expect((await collab.notifications('bob')).unread).toBe(0)
    expect((await collab.notifications('ann')).unread).toBe(1)
  })
})
