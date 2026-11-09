import type { AtelierDriver } from '../../packages/core/src/runtime/server/db/driver'
import type { EntryStore } from '../../packages/core/src/runtime/server/db/store'
import type { JobQueue } from '../../packages/core/src/runtime/server/jobs'
import type { Scheduled } from '../../packages/core/src/runtime/server/schedule'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TZDate } from '@date-fns/tz'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createAuditLog } from '../../packages/core/src/runtime/server/auth/audit'
import { createEntryStore } from '../../packages/core/src/runtime/server/db/store'
import { createJobQueue, defineJob } from '../../packages/core/src/runtime/server/jobs'
import { runScheduled, SCHEDULE_JOB, scheduleKey, schedulesOf } from '../../packages/core/src/runtime/server/schedule'
import * as f from '../../packages/core/src/runtime/shared/fields'
import { connectEngine, createTables, engines, resetDatabase } from './env'

const schema = {
  collections: { posts: { versioned: true, route: { pattern: '/posts/{slug}' }, fields: { slug: f.slug({ required: true }), title: f.text() } } },
  singletons: { banner: { versioned: true, fields: { text: f.text() } } },
}
const schemaFile = join(mkdtempSync(join(tmpdir(), 'atelier-schedule-')), 'schema.json')
writeFileSync(schemaFile, JSON.stringify(schema))

// an editor in Tallinn (UTC+2 in November) schedules for 09:00 their time
const TALLINN = 'Europe/Tallinn'
const local = (day: number, hour: number, minute = 0) => new TZDate(2026, 10, day, hour, minute, TALLINN)

describe.each(engines)('%s scheduled publishing', (_, url) => {
  let driver: AtelierDriver
  let store: EntryStore
  let queue: JobQueue
  const schedule = (job: Scheduled, at: Date) => queue.enqueue(SCHEDULE_JOB, job as unknown as Record<string, unknown>, { key: scheduleKey(job.type, job.id, job.action), runAt: at })

  beforeAll(async () => {
    driver = await connectEngine(url)
    await resetDatabase(driver)
    await createTables(driver, url, schemaFile)
    store = createEntryStore(driver, schema)
    queue = createJobQueue(driver)
    const audit = createAuditLog(driver)
    defineJob<Scheduled>(SCHEDULE_JOB, job => runScheduled(store, audit, job))
  }, 120_000)
  afterAll(() => driver?.close())
  afterEach(() => void vi.useRealTimers())

  it('publishes the version that was scheduled when its time comes, whatever the draft holds by then', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: local(9, 17) })
    const post = await store.save('posts', { data: { slug: 'launch', title: 'Ready to go' } })
    await schedule({ type: 'posts', id: post.id, singleton: false, action: 'publish', version: 1, by: 'editor-1' }, local(10, 9))
    const [scheduled] = await schedulesOf(queue, 'posts', post.id)
    expect(scheduled).toMatchObject({ action: 'publish', version: 1, by: 'editor-1', at: '2026-11-10T07:00:00.000Z' }) // stored in UTC

    // edited after scheduling: the schedule keeps version 1
    await store.save('posts', { id: post.id, version: 1, data: { slug: 'launch', title: 'Still being written' } })

    vi.setSystemTime(local(10, 8, 59))
    expect(await queue.run()).toMatchObject({ ran: 0 })
    expect(await store.get('posts', post.id)).toBeUndefined()

    vi.setSystemTime(local(10, 9, 1))
    expect(await queue.run()).toMatchObject({ ran: 1 })
    expect(await store.get('posts', post.id)).toMatchObject({ version: 1, publishedVersion: 1, path: '/posts/launch', data: { title: 'Ready to go' } })
    expect(await store.get('posts', post.id, { stage: 'draft' })).toMatchObject({ version: 2, publishedVersion: 1, data: { title: 'Still being written' } })
    expect((await store.revisions('posts', post.id)).map(r => [r.version, r.published])).toEqual([[2, false], [1, true]])
    expect(await store.resolve('/posts/launch')).toMatchObject({ id: post.id })
    const [entry] = await createAuditLog(driver).list({ action: 'entry.published' })
    expect(entry).toMatchObject({ actorId: 'editor-1', target: { type: 'posts', id: post.id }, details: { version: 1, scheduled: true } })
    expect(await schedulesOf(queue, 'posts', post.id)).toEqual([])
  })

  it('reschedules with a newer draft by replacing the schedule, and unpublishes on time', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: local(9, 12) })
    const post = await store.save('posts', { data: { slug: 'sale', title: 'Sale' } })
    await schedule({ type: 'posts', id: post.id, singleton: false, action: 'publish', version: 1, by: null }, local(9, 13))
    const v2 = await store.save('posts', { id: post.id, version: 1, data: { slug: 'sale', title: 'Bigger sale' } })
    await schedule({ type: 'posts', id: post.id, singleton: false, action: 'publish', version: v2.version, by: null }, local(9, 14))
    await schedule({ type: 'posts', id: post.id, singleton: false, action: 'unpublish', by: null }, local(9, 18))
    expect((await schedulesOf(queue, 'posts', post.id)).map(s => [s.action, s.version])).toEqual([['publish', 2], ['unpublish', undefined]])

    vi.setSystemTime(local(9, 14, 30))
    await queue.run()
    expect((await store.get('posts', post.id))!.data.title).toBe('Bigger sale')
    vi.setSystemTime(local(9, 18, 30))
    await queue.run()
    expect(await store.get('posts', post.id)).toBeUndefined()
    expect(await store.get('posts', post.id, { stage: 'draft' })).toMatchObject({ publishedVersion: null })
  })

  it('schedules a singleton', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: local(9, 10) })
    await store.saveSingleton('banner', { data: { text: 'Opening soon' } })
    await schedule({ type: 'banner', id: 'banner', singleton: true, action: 'publish', version: 1, by: null }, local(9, 11))
    vi.setSystemTime(local(9, 11, 1))
    await queue.run()
    expect(await store.getSingleton('banner')).toMatchObject({ version: 1, data: { text: 'Opening soon' } })
  })

  it('fails visibly when the scheduled version is gone, and keeps pinned versions through retention', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: local(9, 10) })
    const post = await store.save('posts', { data: { slug: 'pinned', title: 'v1' } })
    for (let v = 1; v <= 3; v++)
      await store.save('posts', { id: post.id, version: v, data: { slug: 'pinned', title: `v${v + 1}` } })
    await store.pruneRevisions({ keep: 1, olderThan: new Date(Date.now() + 1000), pinned: [{ source: 'posts', sourceId: post.id, version: 2 }] })
    expect((await store.revisions('posts', post.id)).map(r => r.version)).toEqual([4, 2])

    await queue.enqueue(SCHEDULE_JOB, { type: 'posts', id: post.id, singleton: false, action: 'publish', version: 1, by: null }, { key: scheduleKey('posts', post.id, 'publish'), runAt: local(9, 11), maxAttempts: 1 })
    vi.setSystemTime(local(9, 11, 1))
    expect(await queue.run()).toMatchObject({ failed: 1 })
    expect((await schedulesOf(queue, 'posts', post.id))[0]).toMatchObject({ status: 'failed', lastError: `No version 1 of entry "${post.id}" in "posts"` })
  })
})
