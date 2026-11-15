// Demo mode (`demo.enabled`): every visitor who starts a demo edits a copy of the site of their own. The
// database the app opens is the template, read-only to visitors; a demo session gets an SQLite copy of it,
// made with VACUUM INTO, and every query of a request in that session runs on the copy: the driver's `db`
// is a proxy choosing, per call, the copy of the request's session (see plugin.ts for how a call knows its
// request). Sessions idle longer than `demo.idleTimeout` are closed and their copies deleted; nothing
// visitors do outlives them, and they can't upload files (storage refuses writes in a session).
import type { RequestEvent } from 'nuxt/server'
import type { AtelierDriver } from '../db/driver'
import type { StorageDriver } from '../media/storage'
import { randomBytes } from 'node:crypto'
import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sql } from 'drizzle-orm'
import { getCookie } from 'nuxt/server'
import { connect } from '../db/driver'
import { apiError } from '../errors'
import { drivers } from '#atelier-drivers'

export const DEMO_COOKIE = 'atelier-demo'
export interface DemoConfig { enabled: boolean, idleTimeout: number, maxSessions: number, perAddress: number, frameAncestors: string[] }
interface Session { driver: AtelierDriver, file: string, used: number, address: string }

const sessions = new Map<string, Session>()
const directory = join(tmpdir(), `atelier-demo-${process.pid}`)
let currentEvent: () => RequestEvent | undefined = () => undefined

/** How a database call finds its request: set by the demo plugin (Nitro's async context). */
export function setEventResolver(resolve: () => RequestEvent | undefined): void {
  currentEvent = resolve
}

/** The demo session of a request, if it has a live one (the one being started, or its cookie's). */
export function sessionOf(event: RequestEvent | undefined): Session | undefined {
  if (!event)
    return undefined
  const id = (event.context.atelierDemo as string | undefined) ?? getCookie(event, DEMO_COOKIE)
  const session = id ? sessions.get(id) : undefined
  if (session)
    session.used = Date.now()
  return session
}
const current = () => sessionOf(currentEvent())
/**
 * Whether this call runs in a demo session: then nothing it reads may go into a cache other visitors read
 * (their content is the template's, not this visitor's copy).
 */
export const inDemoSession = (): boolean => !!current()

/** The template's driver, with every query of a demo session's request running on that session's copy. */
export function demoDriver(template: AtelierDriver): AtelierDriver {
  const pick = () => (current()?.driver.db ?? template.db) as object
  const db = new Proxy(template.db as object, {
    get(_, key) {
      const target = pick()
      const value = Reflect.get(target, key, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
    has: (_, key) => Reflect.has(pick(), key),
  })
  return { ...template, db } as AtelierDriver
}

/**
 * The storage driver, refusing uploads and deletions in a demo session: visitors' files would outlive it,
 * and the template's are everyone's. Image variants are made from the template's files, so they're kept.
 */
export function demoStorage(storage: StorageDriver): StorageDriver {
  const refuse = () => {
    if (current())
      throw apiError(403, 'Uploading and deleting files is off in the demo', {}, 'demo')
  }
  return {
    ...storage,
    put: async (key, body, info) => {
      if (!/^[^/]+\/variants\//.test(key))
        refuse()
      return storage.put(key, body, info)
    },
    delete: async (key) => {
      refuse()
      return storage.delete(key)
    },
    ...storage.deletePrefix && {
      deletePrefix: async (prefix: string) => {
        refuse()
        return storage.deletePrefix!(prefix)
      },
    },
  }
}

/**
 * Starts a session for a visitor at `address`: a copy of the template, with them signed in to it by
 * `signIn` (run as the session's request). Answers its id. The oldest idle sessions make room for it.
 */
export async function startSession(event: RequestEvent, template: AtelierDriver, config: DemoConfig, address: string, signIn: () => Promise<void>): Promise<string> {
  if ([...sessions.values()].filter(s => s.address === address).length >= config.perAddress)
    throw apiError(429, 'Too many demos from your address at once: use one you have open, or try again later', {}, 'rate_limited')
  while (sessions.size >= config.maxSessions)
    await endSession([...sessions].toSorted(([, a], [, b]) => a.used - b.used)[0]![0])
  mkdirSync(directory, { recursive: true })
  const id = randomBytes(24).toString('hex')
  const file = join(directory, `${id}.sqlite`)
  await (template.db as unknown as { run: (query: unknown) => Promise<unknown> }).run(sql.raw(`VACUUM INTO '${file}'`))
  sessions.set(id, { driver: await connect(`file:${file}`, { loaders: drivers }), file, used: Date.now(), address })
  event.context.atelierDemo = id
  try {
    await signIn()
  }
  catch (error) {
    await endSession(id)
    throw error
  }
  return id
}

export async function endSession(id: string): Promise<void> {
  const session = sessions.get(id)
  if (!session)
    return
  sessions.delete(id)
  await session.driver.close().catch(() => {})
  rmSync(session.file, { force: true })
}

/** Ends the sessions idle for longer than `idleTimeout` seconds. */
export async function sweep(idleTimeout: number): Promise<void> {
  const before = Date.now() - idleTimeout * 1000
  for (const [id, session] of sessions) {
    if (session.used < before)
      await endSession(id)
  }
}

export async function endAll(): Promise<void> {
  for (const id of sessions.keys())
    await endSession(id)
  rmSync(directory, { recursive: true, force: true })
}

/** Seconds left before an idle session ends. */
export const secondsLeft = (event: RequestEvent, idleTimeout: number) => {
  const session = sessionOf(event)
  return session ? Math.max(0, Math.round((session.used + idleTimeout * 1000 - Date.now()) / 1000)) : 0
}
