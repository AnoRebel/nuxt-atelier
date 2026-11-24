// Editorial collaboration on the database (the source of truth; real-time pushes only say what changed):
// edit locks that expire unless renewed, presence (who has an entry open), comment threads, notifications.
// Times are ISO strings in UTC, which compare in order as text.
import type { AtelierDriver } from '../db/driver'
import type { Db } from '../db/entries'
import { and, asc, desc, eq, gt, inArray, isNull, lte, or } from 'drizzle-orm'
import { buildTables } from '../db/tables'

export interface Lock { type: string, entry: string, userId: string, acquiredAt: string, expiresAt: string }
export interface Viewer { userId: string, seenAt: string }
export interface Comment {
  id: string
  type: string
  entry: string
  /** The block it's about, or null for the entry. */
  block: string | null
  /** The thread's first comment, or null for a first comment. */
  thread: string | null
  author: string
  body: string
  mentions: string[]
  resolvedAt: string | null
  resolvedBy: string | null
  createdAt: string
  updatedAt: string
}
export type NotificationKind = 'mention' | 'reply' | 'takeover'
export interface Notification { id: string, userId: string, kind: NotificationKind, data: Record<string, unknown>, readAt: string | null, createdAt: string }

const iso = (ms = Date.now()) => new Date(ms).toISOString()
const keyOf = (type: string, entry: string) => `${type}:${entry}`

/** Every block id in an entry's data, at any depth. */
export function blockIds(value: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    value.forEach(item => blockIds(item, into))
  }
  else if (value && typeof value === 'object') {
    const node = value as Record<string, unknown>
    if (typeof node.id === 'string' && typeof node.type === 'string')
      into.add(node.id)
    Object.values(node).forEach(item => blockIds(item, into))
  }
  return into
}

export function createCollabStore(driver: AtelierDriver, options: { lockTimeout: number, presenceTimeout: number }) {
  const t = buildTables(driver.dialect, { collections: {}, singletons: {} })
  const { atelier_locks: locks, atelier_presence: presence, atelier_comments: comments, atelier_notifications: notifications } = t
  const db = driver.db as Db
  const toLock = (r: Record<string, unknown>): Lock => ({ type: String(r.type), entry: String(r.entry), userId: String(r.userId), acquiredAt: String(r.acquiredAt), expiresAt: String(r.expiresAt) })
  const toComment = (r: Record<string, unknown>): Comment => ({
    id: String(r._id),
    type: String(r.type),
    entry: String(r.entry),
    block: (r.block as string | null) ?? null,
    thread: (r.thread as string | null) ?? null,
    author: String(r.author),
    body: String(r.body),
    mentions: (typeof r.mentions === 'string' ? JSON.parse(r.mentions) : r.mentions) as string[] ?? [],
    resolvedAt: (r.resolvedAt as string | null) ?? null,
    resolvedBy: (r.resolvedBy as string | null) ?? null,
    createdAt: String(r.createdAt),
    updatedAt: String(r.updatedAt),
  })

  /** The lock in force on an entry: none once it expired. */
  async function lockOf(type: string, entry: string): Promise<Lock | null> {
    const [row] = await db.select().from(locks).where(and(eq(locks.key, keyOf(type, entry)), gt(locks.expiresAt, iso())))
    return row ? toLock(row) : null
  }

  return {
    lockOf,

    /**
     * Takes or renews the lock for `userId`. Held by someone else: refused (the holder's lock is returned), or
     * taken over with `takeover`, answering whom it was taken from.
     */
    async acquire(type: string, entry: string, userId: string, takeover = false): Promise<{ lock: Lock, granted: boolean, takenFrom?: string }> {
      const key = keyOf(type, entry)
      const now = iso()
      const expiresAt = iso(Date.now() + options.lockTimeout * 1000)
      await db.delete(locks).where(and(eq(locks.key, key), lte(locks.expiresAt, now))) // an expired lock is nobody's
      const current = await lockOf(type, entry)
      if (current && current.userId !== userId && !takeover)
        return { lock: current, granted: false }
      if (current) {
        await db.update(locks).set({ userId, expiresAt, ...current.userId === userId ? {} : { acquiredAt: now } }).where(eq(locks.key, key))
        const lock = { ...current, userId, expiresAt, ...current.userId === userId ? {} : { acquiredAt: now } }
        return { lock, granted: true, ...current.userId === userId ? {} : { takenFrom: current.userId } }
      }
      try {
        await db.insert(locks).values({ key, type, entry, userId, acquiredAt: now, expiresAt })
      }
      catch {
        // someone took it in between: theirs
        const raced = await lockOf(type, entry)
        if (raced && raced.userId !== userId)
          return { lock: raced, granted: false }
      }
      return { lock: { type, entry, userId, acquiredAt: now, expiresAt }, granted: true }
    },

    /** Gives up `userId`'s lock, if they hold it. */
    async release(type: string, entry: string, userId: string): Promise<boolean> {
      const current = await lockOf(type, entry)
      if (current?.userId !== userId)
        return false
      await db.delete(locks).where(and(eq(locks.key, keyOf(type, entry)), eq(locks.userId, userId)))
      return true
    },

    /** Marks `userId` as having the entry open now. */
    async touch(type: string, entry: string, userId: string): Promise<void> {
      const key = `${keyOf(type, entry)}:${userId}`
      const seenAt = iso()
      const [existing] = await db.select({ key: presence.key }).from(presence).where(eq(presence.key, key))
      if (existing)
        await db.update(presence).set({ seenAt }).where(eq(presence.key, key))
      else
        await db.insert(presence).values({ key, type, entry, userId, seenAt }).catch(() => undefined) // a concurrent first touch
    },

    /** `userId` closed the entry. */
    async leave(type: string, entry: string, userId: string): Promise<void> {
      await db.delete(presence).where(eq(presence.key, `${keyOf(type, entry)}:${userId}`))
    },

    /** Who has the entry open: seen within the presence timeout. */
    async viewers(type: string, entry: string): Promise<Viewer[]> {
      const since = iso(Date.now() - options.presenceTimeout * 1000)
      const rows = await db.select().from(presence).where(and(eq(presence.type, type), eq(presence.entry, entry), gt(presence.seenAt, since))).orderBy(asc(presence.seenAt))
      return rows.map((r: Record<string, unknown>) => ({ userId: String(r.userId), seenAt: String(r.seenAt) }))
    },

    // --- comments

    async comments(type: string, entry: string): Promise<Comment[]> {
      const rows = await db.select().from(comments).where(and(eq(comments.type, type), eq(comments.entry, entry))).orderBy(asc(comments.createdAt))
      // a reply saved in the same millisecond as its thread's first comment still comes after it (ids are random)
      return rows.map(toComment).sort((a, b) => a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : Number(a.thread !== null) - Number(b.thread !== null))
    },
    async comment(id: string): Promise<Comment | null> {
      const [row] = await db.select().from(comments).where(eq(comments._id, id))
      return row ? toComment(row) : null
    },
    async addComment(input: { type: string, entry: string, block: string | null, thread: string | null, author: string, body: string, mentions: string[] }): Promise<Comment> {
      const now = iso()
      const comment: Comment = { id: crypto.randomUUID(), ...input, resolvedAt: null, resolvedBy: null, createdAt: now, updatedAt: now }
      await db.insert(comments).values({ _id: comment.id, type: input.type, entry: input.entry, block: input.block, thread: input.thread, author: input.author, body: input.body, mentions: input.mentions, createdAt: now, updatedAt: now })
      return comment
    },
    async editComment(id: string, body: string, mentions: string[]): Promise<void> {
      await db.update(comments).set({ body, mentions, updatedAt: iso() }).where(eq(comments._id, id))
    },
    /** Resolves (or reopens) a thread: its first comment carries the state. */
    async resolve(id: string, by: string | null): Promise<void> {
      await db.update(comments).set({ resolvedAt: by ? iso() : null, resolvedBy: by }).where(eq(comments._id, id))
    },
    /** Deletes a comment; a thread's first comment takes its replies with it. */
    async deleteComment(id: string): Promise<void> {
      await db.delete(comments).where(or(eq(comments._id, id), eq(comments.thread, id)))
    },
    /** An entry's comments go with it. */
    async deleteEntryComments(type: string, entry: string): Promise<void> {
      await db.delete(comments).where(and(eq(comments.type, type), eq(comments.entry, entry)))
    },

    // --- notifications

    async notify(userId: string, kind: NotificationKind, data: Record<string, unknown>): Promise<Notification> {
      const notification: Notification = { id: crypto.randomUUID(), userId, kind, data, readAt: null, createdAt: iso() }
      await db.insert(notifications).values({ _id: notification.id, userId, kind, data, readAt: null, createdAt: notification.createdAt })
      return notification
    },
    async notifications(userId: string, options: { unread?: boolean, limit?: number } = {}): Promise<{ items: Notification[], unread: number }> {
      const mine = eq(notifications.userId, userId)
      const rows = await db.select().from(notifications).where(options.unread ? and(mine, isNull(notifications.readAt)) : mine).orderBy(desc(notifications.createdAt)).limit(options.limit ?? 50)
      const unread = await db.select({ id: notifications._id }).from(notifications).where(and(mine, isNull(notifications.readAt)))
      return {
        items: rows.map((r: Record<string, unknown>) => ({ id: String(r._id), userId: String(r.userId), kind: r.kind as NotificationKind, data: (typeof r.data === 'string' ? JSON.parse(r.data) : r.data) as Record<string, unknown>, readAt: (r.readAt as string | null) ?? null, createdAt: String(r.createdAt) })),
        unread: unread.length,
      }
    },
    /** Marks a user's notifications read: these, or all. */
    async markRead(userId: string, ids?: string[]): Promise<void> {
      await db.update(notifications).set({ readAt: iso() }).where(and(eq(notifications.userId, userId), isNull(notifications.readAt), ...ids ? [inArray(notifications._id, ids.length ? ids : [''])] : []))
    },
  }
}

export type CollabStore = ReturnType<typeof createCollabStore>
