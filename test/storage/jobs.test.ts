import type { AtelierDriver } from '../../packages/core/src/runtime/server/db/driver'
import type { JobQueue } from '../../packages/core/src/runtime/server/jobs'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { backoff, createJobQueue, defineJob } from '../../packages/core/src/runtime/server/jobs'
import { connectEngine, createTables, engines, query, resetDatabase } from './env'

const schemaFile = join(mkdtempSync(join(tmpdir(), 'atelier-jobs-')), 'schema.json')
writeFileSync(schemaFile, JSON.stringify({ collections: {}, singletons: {} }))

let calls: string[] = []
let failing = true
defineJob<{ n: number }>('test:ok', ({ n }) => void calls.push(`ok ${n}`))
defineJob('test:flaky', () => {
  calls.push('flaky')
  if (failing)
    throw new Error('the service is down')
})
defineJob<{ n: number }>('test:slow', async ({ n }) => {
  await new Promise(resolve => setTimeout(resolve, 60))
  calls.push(`slow ${n}`)
})

describe.each(engines)('%s job queue', (_, url) => {
  let driver: AtelierDriver
  let queue: JobQueue
  const pastDue = () => query(driver, sql`update atelier_jobs set run_at = ${'2000-01-01T00:00:00.000Z'} where status = ${'queued'}`)

  beforeAll(async () => {
    driver = await connectEngine(url)
    await resetDatabase(driver)
    await createTables(driver, url, schemaFile)
    queue = createJobQueue(driver, { concurrency: 2 })
  }, 120_000)
  afterAll(() => driver?.close())
  beforeEach(async () => {
    calls = []
    failing = true
    await query(driver, sql`delete from atelier_jobs`)
  })

  it('runs due jobs once and removes them; future jobs wait', async () => {
    await queue.enqueue('test:ok', { n: 1 })
    await queue.enqueue('test:ok', { n: 2 }, { runAt: new Date(Date.now() + 3600_000) })
    expect(await queue.run()).toEqual({ ran: 1, failed: 0, remaining: 0 })
    expect(calls).toEqual(['ok 1'])
    expect((await queue.list()).map(j => j.payload)).toEqual([{ n: 2 }])
  })

  it('retries with backoff, then keeps the job as failed with its last error until it\'s retried', async () => {
    const id = await queue.enqueue('test:flaky', {}, { maxAttempts: 2 })
    expect(await queue.run()).toEqual({ ran: 0, failed: 1, remaining: 0 })
    const waiting = (await queue.get(id))!
    expect(waiting).toMatchObject({ status: 'queued', attempts: 1, lastError: 'the service is down' })
    expect(Date.parse(waiting.runAt) - Date.now()).toBeGreaterThan(backoff(1) - 5000)

    await pastDue()
    expect(await queue.run()).toMatchObject({ failed: 1 })
    expect(await queue.get(id)).toMatchObject({ status: 'failed', attempts: 2, lastError: 'the service is down' })
    await pastDue()
    expect(await queue.run()).toEqual({ ran: 0, failed: 0, remaining: 0 }) // failed for good: not run again
    expect((await queue.list({ status: 'failed' })).map(j => j.id)).toEqual([id])

    failing = false
    expect(await queue.retry(id)).toBe(true)
    expect(await queue.run()).toMatchObject({ ran: 1 })
    expect(await queue.get(id)).toBeUndefined()
    expect(calls).toEqual(['flaky', 'flaky', 'flaky'])
    expect([backoff(1), backoff(2), backoff(3), backoff(20)]).toEqual([30_000, 60_000, 120_000, 3600_000])
  })

  it('fails a job without a handler, naming it', async () => {
    const id = await queue.enqueue('test:nobody', {}, { maxAttempts: 1 })
    await queue.run()
    expect((await queue.get(id))!.lastError).toBe('No handler for jobs named "test:nobody": register one with defineJob()')
  })

  it('keeps one job per key, and cancels by key', async () => {
    await queue.enqueue('test:ok', { n: 1 }, { key: 'k', runAt: new Date(Date.now() + 3600_000) })
    await queue.enqueue('test:ok', { n: 2 }, { key: 'k', runAt: new Date(Date.now() + 7200_000) })
    expect((await queue.list()).map(j => j.payload)).toEqual([{ n: 2 }])
    expect((await queue.byKey('k'))!.payload).toEqual({ n: 2 })
    expect(await queue.cancel('k')).toBe(true)
    expect(await queue.list()).toEqual([])
  })

  it('gives each job to one runner, however many drain the queue at once', async () => {
    for (let n = 0; n < 12; n++)
      await queue.enqueue('test:ok', { n })
    const runners = [queue, createJobQueue(driver, { concurrency: 3 }), createJobQueue(driver, { concurrency: 1 })]
    const results = await Promise.all(runners.map(r => r.run()))
    expect(results.reduce((sum, r) => sum + r.ran, 0)).toBe(12)
    expect(calls.toSorted()).toEqual(Array.from({ length: 12 }, (_, n) => `ok ${n}`).toSorted())
  })

  it('starts no job after the time budget: the rest stay queued', async () => {
    for (let n = 0; n < 8; n++)
      await queue.enqueue('test:slow', { n })
    const result = await queue.run({ budgetMs: 100 }) // two at a time, 60 ms each
    expect(result.ran).toBeGreaterThan(0)
    expect(result.ran).toBeLessThan(8)
    expect(result.ran + result.remaining).toBe(8)
    expect(await queue.run()).toMatchObject({ ran: result.remaining, remaining: 0 })
  })

  it('takes over the jobs of a runner that died once their lock passes, as another attempt', async () => {
    const id = await queue.enqueue('test:ok', { n: 7 })
    await query(driver, sql`update atelier_jobs set status = ${'running'}, attempts = 1, locked_until = ${'2000-01-01T00:00:00.000Z'} where _id = ${id}`)
    expect(await queue.run()).toMatchObject({ ran: 1 })
    expect(calls).toEqual(['ok 7'])
  })
})
