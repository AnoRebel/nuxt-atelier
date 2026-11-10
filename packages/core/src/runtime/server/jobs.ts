// The background job queue, on the app's database (atelier_jobs): durable, retried with exponential
// backoff up to `maxAttempts`, then kept as failed with its last error until someone retries it.
//
// Jobs are taken atomically, so any number of runners can drain the queue at once: on Postgres and MySQL
// with `FOR UPDATE SKIP LOCKED` in a transaction, elsewhere (SQLite, D1) by an update that only matches
// the row as it was read. A runner that dies leaves its jobs locked until `LOCK_MS` passes; then they're
// taken again, as another attempt.
import type { AtelierDriver } from './db/driver'
import type { Db } from './db/entries'
import { and, asc, desc, eq, inArray, lt, lte, or, sql } from 'drizzle-orm'
import { deadlocked } from './db/driver'
import { affected } from './db/store'
import { buildTables } from './db/tables'

export type JobStatus = 'queued' | 'running' | 'failed'

export interface Job<P = Record<string, unknown>> {
  id: string
  name: string
  key: string | null
  payload: P
  status: JobStatus
  runAt: string
  attempts: number
  maxAttempts: number
  lastError: string | null
  createdAt: string
}

/** Runs one job; throwing fails the attempt. */
export type JobHandler<P = Record<string, unknown>> = (payload: P, job: Job<P>) => unknown

export interface EnqueueOptions {
  /** When it's due: now by default. */
  runAt?: Date | string
  /** Attempts before it's kept as failed: 5 by default. */
  maxAttempts?: number
  /** At most one job per key: enqueueing again replaces the one there (e.g. `publish:posts:8f1c`). */
  key?: string
}

export interface RunResult {
  /** Jobs that succeeded. */
  ran: number
  /** Attempts that failed (some will be retried). */
  failed: number
  /** Jobs due and not run, left for the next run. */
  remaining: number
}

const LOCK_MS = 5 * 60_000
const BACKOFF_MS = 30_000
const MAX_BACKOFF_MS = 3600_000

const handlers = new Map<string, JobHandler<never>>()
/** Jobs that run on their own every so often (ms), keyed by name. */
const recurring = new Map<string, number>()

/**
 * Registers the handler for jobs named `name`, from a server plugin. Registering a name again replaces it.
 * With `every` (ms), one such job is kept queued under the name as its key: run when the queue is first
 * drained, then `every` after each success.
 */
export function defineJob<P = Record<string, unknown>>(name: string, handler: JobHandler<P>, options: { every?: number } = {}): void {
  handlers.set(name, handler as JobHandler<never>)
  if (options.every)
    recurring.set(name, options.every)
  else
    recurring.delete(name)
}

const iso = (time: Date | string | number) => new Date(time).toISOString()
/** The delay before attempt `attempts + 1`: 30 s, 1 min, 2 min … at most an hour. */
export const backoff = (attempts: number) => Math.min(BACKOFF_MS * 2 ** Math.max(0, attempts - 1), MAX_BACKOFF_MS)

export function createJobQueue(driver: AtelierDriver, options: { concurrency?: number } = {}) {
  const { atelier_jobs: jobs } = buildTables(driver.dialect, { collections: {}, singletons: {} })
  const db = driver.db as Db
  const concurrency = options.concurrency ?? 4

  const toJob = (row: Record<string, unknown>): Job => ({
    id: row.id as string,
    name: row.name as string,
    key: (row.key as string | null) ?? null,
    payload: row.payload as Record<string, unknown>,
    status: row.status as JobStatus,
    runAt: row.runAt as string,
    attempts: Number(row.attempts),
    maxAttempts: Number(row.maxAttempts),
    lastError: (row.lastError as string | null) ?? null,
    createdAt: row.createdAt as string,
  })

  const due = (now: string) => or(
    and(eq(jobs.status, 'queued'), lte(jobs.runAt, now)),
    and(eq(jobs.status, 'running'), lt(jobs.lockedUntil, now)),
  )

  /** Takes up to `n` due jobs for this runner: each is taken by one runner only. */
  async function claim(n: number, now: string): Promise<Job[]> {
    const lock = { status: 'running', lockedUntil: iso(Date.parse(now) + LOCK_MS), attempts: sql`${jobs.attempts} + 1` }
    if (driver.dialect !== 'sqlite') {
      // InnoDB can still deadlock two runners on its index locks; a deadlock rolls back, so try again
      for (let attempt = 1; ; attempt++) {
        try {
          return await db.transaction(async (tx: Db) => {
            const rows: Record<string, unknown>[] = await tx.select().from(jobs).where(due(now)).orderBy(asc(jobs.runAt)).limit(n).for('update', { skipLocked: true })
            if (rows.length)
              await tx.update(jobs).set(lock).where(inArray(jobs.id, rows.map(r => r.id as string)))
            return rows.map(r => ({ ...toJob(r), status: 'running' as const, attempts: Number(r.attempts) + 1 }))
          })
        }
        catch (error) {
          if (attempt >= 5 || !deadlocked(error))
            throw error
          await new Promise(resolve => setTimeout(resolve, Math.random() * 20 * attempt))
        }
      }
    }
    const rows: Record<string, unknown>[] = await db.select().from(jobs).where(due(now)).orderBy(asc(jobs.runAt)).limit(n)
    const taken: Job[] = []
    for (const row of rows) {
      // matches only if no other runner took it since it was read
      const result = await db.update(jobs).set(lock)
        .where(and(eq(jobs.id, row.id as string), eq(jobs.status, row.status as string), eq(jobs.attempts, row.attempts as number)))
      if (affected(result) === 1)
        taken.push({ ...toJob(row), status: 'running', attempts: Number(row.attempts) + 1 })
    }
    return taken
  }

  /** Runs one taken job: done (removed), retried later, or failed for good. */
  async function attempt(job: Job): Promise<boolean> {
    try {
      const handler = handlers.get(job.name)
      if (!handler)
        throw new Error(`No handler for jobs named "${job.name}": register one with defineJob()`)
      await handler(job.payload as never, job as never)
      const mine = and(eq(jobs.id, job.id), eq(jobs.attempts, job.attempts))
      const every = job.key === job.name ? recurring.get(job.name) : undefined
      if (every)
        await db.update(jobs).set({ status: 'queued', attempts: 0, runAt: iso(Date.now() + every), lockedUntil: null, lastError: null }).where(mine)
      else
        await db.delete(jobs).where(mine)
      return true
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const last = job.attempts >= job.maxAttempts
      await db.update(jobs).set({
        status: last ? 'failed' : 'queued',
        runAt: last ? job.runAt : iso(Date.now() + backoff(job.attempts)),
        lockedUntil: null,
        lastError: message.slice(0, 4000),
      }).where(and(eq(jobs.id, job.id), eq(jobs.attempts, job.attempts)))
      return false
    }
  }

  return {
    /** Adds a job; returns its id. */
    async enqueue(name: string, payload: Record<string, unknown> = {}, options: EnqueueOptions = {}): Promise<string> {
      const id = crypto.randomUUID()
      const row = {
        id,
        name,
        key: options.key ?? null,
        payload,
        status: 'queued',
        runAt: iso(options.runAt ?? Date.now()),
        attempts: 0,
        maxAttempts: options.maxAttempts ?? 5,
        lockedUntil: null,
        lastError: null,
        createdAt: iso(Date.now()),
      }
      const statements = (q: Db) => [...options.key === undefined ? [] : [q.delete(jobs).where(eq(jobs.key, options.key))], q.insert(jobs).values(row)]
      if (!driver.capabilities.transactions) {
        await db.batch(statements(db))
      }
      else {
        await db.transaction(async (tx: Db) => {
          for (const statement of statements(tx))
            await statement
        })
      }
      return id
    },

    /** Removes the job with this key, if any. */
    async cancel(key: string): Promise<boolean> {
      return affected(await db.delete(jobs).where(eq(jobs.key, key))) > 0
    },

    async get(id: string): Promise<Job | undefined> {
      const [row] = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1)
      return row && toJob(row)
    },

    /** The job with this key, if any. */
    async byKey(key: string): Promise<Job | undefined> {
      const [row] = await db.select().from(jobs).where(eq(jobs.key, key)).limit(1)
      return row && toJob(row)
    },

    /** Jobs, newest first, optionally of one status or name. */
    async list(options: { status?: JobStatus, name?: string, limit?: number } = {}): Promise<Job[]> {
      const rows: Record<string, unknown>[] = await db.select().from(jobs)
        .where(and(options.status ? eq(jobs.status, options.status) : undefined, options.name ? eq(jobs.name, options.name) : undefined))
        .orderBy(desc(jobs.createdAt)).limit(options.limit ?? 50)
      return rows.map(toJob)
    },

    /** Queues a failed job again, from its first attempt. */
    async retry(id: string): Promise<boolean> {
      return affected(await db.update(jobs).set({ status: 'queued', attempts: 0, runAt: iso(Date.now()), lastError: null })
        .where(and(eq(jobs.id, id), eq(jobs.status, 'failed')))) > 0
    },

    /**
     * Runs due jobs, `concurrency` at a time, until none are due or `budgetMs` has passed: no job starts
     * after that, so the jobs left stay queued for the next run.
     */
    async run(options: { budgetMs?: number } = {}): Promise<RunResult> {
      const deadline = Date.now() + (options.budgetMs ?? 50_000)
      const result: RunResult = { ran: 0, failed: 0, remaining: 0 }
      for (const name of recurring.keys()) {
        if (!await this.byKey(name))
          await this.enqueue(name, {}, { key: name })
      }
      while (Date.now() < deadline) {
        const batch = await claim(concurrency, iso(Date.now()))
        if (!batch.length)
          break
        const outcomes = await Promise.all(batch.map(attempt))
        result.ran += outcomes.filter(Boolean).length
        result.failed += outcomes.filter(ok => !ok).length
      }
      const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(jobs).where(due(iso(Date.now())))
      result.remaining = Number(count)
      return result
    },
  }
}

export type JobQueue = ReturnType<typeof createJobQueue>
