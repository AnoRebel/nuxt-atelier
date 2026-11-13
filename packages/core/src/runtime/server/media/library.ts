// The media library: files in a storage driver, their metadata in `atelier_media`. Uploads are streamed:
// the first bytes decide the type (sniffed from the content, never trusted from the name or the client),
// and the size is counted as the rest goes to storage.
import type { Field } from '../../shared/fields'
import type { AtelierDriver } from '../db/driver'
import type { Db } from '../db/entries'
import type { Filter, ListQuery } from '../db/query'
import type { SiteContext } from '../sites'
import type { StorageDriver } from './storage'
import { fileTypeFromBuffer } from 'file-type'
import { and, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm'
import { afterCursor, compileFilter, compileSort, decodeCursor, encodeCursor, orderBy } from '../db/query'
import { affected, MEDIA_TARGET } from '../db/store'
import { buildTables } from '../db/tables'
import { singleSite } from '../sites'
import { storageKey } from './storage'

/** What may be uploaded by default: types recognised from their content. */
const DEFAULT_ACCEPT = ['image/*', 'video/*', 'audio/*', 'application/pdf']
const SNIFF_BYTES = 4100 // what file-type needs to recognise every type it knows

export interface MediaItem {
  id: string
  key: string
  filename: string
  mime: string
  size: number
  width: number | null
  height: number | null
  title: string | null
  /** Alt text per locale ('' for one shared by every locale). */
  alt: Record<string, string> | null
  caption: string | null
  credits: string | null
  folder: string
  tags: string[]
  /** Where the subject is, from 0 to 1 across and down, for crops. */
  focal: { x: number, y: number } | null
  private: boolean
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

/** A resumable upload in progress. */
export interface UploadSession {
  id: string
  /** Who started it. */
  createdBy: string | null
  filename: string
  size: number
  /** Bytes stored so far: where the next chunk starts. */
  received: number
}

/** A chunk refused: 409 at the wrong offset (`received` says where to continue), 413 past the announced size. */
export class ChunkError extends Error {
  constructor(readonly statusCode: 409 | 413, message: string, readonly received: number) {
    super(message)
  }
}

export type MediaChanges = Partial<Pick<MediaItem, 'title' | 'alt' | 'caption' | 'credits' | 'folder' | 'tags' | 'focal' | 'private'>>

/** An upload refused: 413 too large, 415 a type that isn't allowed. */
export class UploadError extends Error {
  constructor(readonly statusCode: 413 | 415, message: string) {
    super(message)
  }
}

/** The media fields the query language filters and sorts on. */
const QUERY_FIELDS: Record<string, Field> = {
  filename: { type: 'text' },
  mime: { type: 'text' },
  size: { type: 'number' },
  width: { type: 'number' },
  height: { type: 'number' },
  title: { type: 'text' },
  caption: { type: 'text' },
  credits: { type: 'text' },
  folder: { type: 'text' },
  tags: { type: 'multiSelect', options: [] },
  private: { type: 'boolean' },
}

const accepts = (accept: readonly string[], mime: string) =>
  accept.some(pattern => pattern === mime || (pattern.endsWith('/*') && mime.startsWith(pattern.slice(0, -1))))

/** The first `bytes` of a stream, and a stream of all of it. */
async function peek(body: ReadableStream<Uint8Array>, bytes: number): Promise<{ head: Uint8Array, whole: ReadableStream<Uint8Array> }> {
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  let done = false
  while (length < bytes) {
    const next = await reader.read()
    if (next.done) {
      done = true
      break
    }
    chunks.push(next.value)
    length += next.value.length
  }
  const head = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    head.set(chunk, offset)
    offset += chunk.length
  }
  const whole = new ReadableStream<Uint8Array>({
    start(controller) {
      if (head.length)
        controller.enqueue(head)
      if (done)
        controller.close()
    },
    async pull(controller) {
      const next = await reader.read()
      if (next.done)
        controller.close()
      else
        controller.enqueue(next.value)
    },
    cancel: reason => reader.cancel(reason),
  })
  return { head, whole }
}

/** A stream that errors once more than `max` bytes went through, counting them in `seen`. */
function limited(max: number, seen: { bytes: number }) {
  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      seen.bytes += chunk.length
      if (seen.bytes > max)
        controller.error(new UploadError(413, `The file is larger than the ${Math.round(max / 1024 / 1024 * 10) / 10} MB allowed`))
      else
        controller.enqueue(chunk)
    },
  })
}

export function createMediaLibrary(driver: AtelierDriver, storage: StorageDriver, options: { maxUploadSize: number, accept?: readonly string[], site?: SiteContext }) {
  const site = options.site ?? singleSite
  const { atelier_media: media, atelier_media_uploads: uploads, atelier_relations: relations, atelier_p_relations: publishedRelations } = buildTables(driver.dialect, { collections: {}, singletons: {}, sites: site.scoped })
  const db = driver.db as Db
  // with sites: a site's own media, and media every site shares (site null); another site's is invisible
  const visible = site.scoped ? or(eq(media.site, site.name), isNull(media.site)) : undefined
  const mine = (id: string) => and(eq(media._id, id), visible)
  const accept = options.accept ?? DEFAULT_ACCEPT

  const toItem = (r: Record<string, unknown>): MediaItem => ({
    id: r._id as string,
    key: r.key as string,
    filename: r.filename as string,
    mime: r.mime as string,
    size: Number(r.size),
    width: (r.width as number | null) ?? null,
    height: (r.height as number | null) ?? null,
    title: (r.title as string | null) ?? null,
    alt: (r.alt as Record<string, string> | null) ?? null,
    caption: (r.caption as string | null) ?? null,
    credits: (r.credits as string | null) ?? null,
    folder: r.folder as string,
    tags: (r.tags as string[]) ?? [],
    focal: (r.focal as { x: number, y: number } | null) ?? null,
    private: Boolean(r.private),
    createdBy: (r._createdBy as string | null) ?? null,
    createdAt: r._createdAt as string,
    updatedAt: r._updatedAt as string,
  })

  const context = {
    dialect: driver.dialect,
    fields: QUERY_FIELDS,
    table: media,
    relations,
    source: 'atelier_media',
    relationsQuery: (where: unknown) => db.select({ one: sql`1` }).from(relations).where(where),
  }

  return {
    storage,

    /**
     * Stores an uploaded file and its row. 415 for a type that isn't allowed (judged by its content),
     * 413 past `maxUploadSize`; nothing is kept from a refused upload.
     */
    async upload(input: { body: ReadableStream<Uint8Array>, filename: string, folder?: string, private?: boolean, createdBy: string | null, /** With sites: for every site, not just this one. */ shared?: boolean }): Promise<MediaItem> {
      const { head, whole } = await peek(input.body, SNIFF_BYTES)
      const type = await fileTypeFromBuffer(head)
      if (!type || !accepts(accept, type.mime)) {
        await whole.cancel()
        throw new UploadError(415, type
          ? `${type.mime} files aren't allowed here; allowed: ${accept.join(', ')}`
          : `This file's type can't be recognised from its content; allowed: ${accept.join(', ')}`)
      }
      const id = crypto.randomUUID()
      const key = storageKey(id, input.filename)
      const seen = { bytes: 0 }
      try {
        await storage.put(key, whole.pipeThrough(limited(options.maxUploadSize, seen)), { contentType: type.mime })
        const now = new Date().toISOString()
        const row = {
          _id: id,
          key,
          filename: input.filename.slice(0, 255),
          mime: type.mime,
          size: seen.bytes,
          width: null,
          height: null,
          title: null,
          alt: null,
          caption: null,
          credits: null,
          folder: input.folder ?? '',
          tags: [],
          focal: null,
          private: input.private ?? false,
          _createdBy: input.createdBy,
          _createdAt: now,
          _updatedAt: now,
          ...site.scoped ? { site: input.shared ? null : site.name } : {},
        }
        await db.insert(media).values(row)
        return toItem(row)
      }
      catch (error) {
        await storage.delete(key).catch(() => {})
        throw error
      }
    },

    /** Starts a resumable upload of a `size`-byte file. 413 past `maxUploadSize`. */
    async startUpload(input: { filename: string, size: number, folder?: string, private?: boolean, createdBy: string | null }): Promise<UploadSession> {
      if (input.size > options.maxUploadSize)
        throw new UploadError(413, `The file is larger than the ${Math.round(options.maxUploadSize / 1024 / 1024 * 10) / 10} MB allowed`)
      const row = { id: crypto.randomUUID(), filename: input.filename.slice(0, 255), folder: input.folder ?? '', private: input.private ?? false, size: input.size, received: 0, parts: [], createdBy: input.createdBy, createdAt: new Date().toISOString() }
      await db.insert(uploads).values(row)
      return { id: row.id, createdBy: row.createdBy, filename: row.filename, size: row.size, received: 0 }
    },

    async uploadSession(id: string): Promise<UploadSession | undefined> {
      const [row] = await db.select().from(uploads).where(eq(uploads.id, id)).limit(1)
      return row && { id: row.id, createdBy: row.createdBy ?? null, filename: row.filename, size: Number(row.size), received: Number(row.received) }
    },

    /**
     * Stores the chunk starting at `offset`, which must be where the upload stands (409 with `received`
     * otherwise: the client resumes from there). A chunk sent twice, after a lost answer, is refused the
     * same way rather than stored twice.
     */
    async appendChunk(id: string, offset: number, body: ReadableStream<Uint8Array>): Promise<UploadSession> {
      const [row] = await db.select().from(uploads).where(eq(uploads.id, id)).limit(1)
      if (!row)
        throw new ChunkError(409, 'No such upload: start again', 0)
      const received = Number(row.received)
      const size = Number(row.size)
      if (offset !== received) {
        await body.cancel()
        throw new ChunkError(409, `Send the chunk starting at byte ${received}`, received)
      }
      const key = `uploads/${id}/${offset}`
      const seen = { bytes: 0 }
      await storage.put(key, body.pipeThrough(limited(size - received, seen)), { contentType: 'application/octet-stream' })
        .catch((error: unknown) => {
          throw error instanceof UploadError ? new ChunkError(413, `The file is larger than the ${size} bytes announced`, received) : error
        })
      const parts = [...row.parts as { offset: number, size: number }[], { offset, size: seen.bytes }]
      // only if no other request moved it on meanwhile
      const moved = await db.update(uploads).set({ received: received + seen.bytes, parts }).where(and(eq(uploads.id, id), eq(uploads.received, received)))
      if (!affected(moved)) {
        await storage.delete(key)
        const now = (await this.uploadSession(id))?.received ?? 0
        throw new ChunkError(409, `Send the chunk starting at byte ${now}`, now)
      }
      return { id, createdBy: row.createdBy ?? null, filename: row.filename, size, received: received + seen.bytes }
    },

    /** Finishes an upload once every byte is in: the file goes through `upload` (its type checked), the chunks go. */
    async completeUpload(id: string, createdBy: string | null): Promise<MediaItem> {
      const [row] = await db.select().from(uploads).where(eq(uploads.id, id)).limit(1)
      if (!row)
        throw new ChunkError(409, 'No such upload: start again', 0)
      if (Number(row.received) !== Number(row.size))
        throw new ChunkError(409, `${row.received} of ${row.size} bytes received: send the rest first`, Number(row.received))
      const parts = row.parts as { offset: number }[]
      let index = 0
      let current: ReadableStreamDefaultReader<Uint8Array> | undefined
      // the chunks, one after another, as one stream
      const body = new ReadableStream<Uint8Array>({
        async pull(controller) {
          while (true) {
            if (!current) {
              if (index >= parts.length)
                return controller.close()
              const file = await storage.get(`uploads/${id}/${parts[index++]!.offset}`)
              if (!file)
                return controller.error(new Error('A chunk of this upload is missing: start again'))
              current = file.stream.getReader()
            }
            const next = await current.read()
            if (!next.done)
              return controller.enqueue(next.value)
            current = undefined
          }
        },
      })
      const item = await this.upload({ body, filename: row.filename, folder: row.folder, private: Boolean(row.private), createdBy })
      await this.discardUpload(id)
      return item
    },

    /** Deletes an upload in progress and its chunks. */
    async discardUpload(id: string): Promise<void> {
      const [row] = await db.select({ parts: uploads.parts }).from(uploads).where(eq(uploads.id, id)).limit(1)
      for (const part of (row?.parts ?? []) as { offset: number }[])
        await storage.delete(`uploads/${id}/${part.offset}`)
      await db.delete(uploads).where(eq(uploads.id, id))
    },

    /** Discards uploads started before `olderThan`: abandoned ones. Returns how many. */
    async discardUploadsBefore(olderThan: Date): Promise<number> {
      const stale: { id: string }[] = await db.select({ id: uploads.id }).from(uploads).where(lt(uploads.createdAt, olderThan.toISOString()))
      for (const { id } of stale)
        await this.discardUpload(id)
      return stale.length
    },

    /** Records an image's width and height (measured after it's stored). */
    async setDimensions(id: string, size: { width: number, height: number }): Promise<MediaItem | undefined> {
      await db.update(media).set({ width: size.width, height: size.height }).where(mine(id))
      return this.get(id)
    },

    /** Items by id; missing ones are left out. */
    async getMany(ids: string[]): Promise<MediaItem[]> {
      if (!ids.length)
        return []
      const rows: Record<string, unknown>[] = await db.select().from(media).where(and(inArray(media._id, ids.slice(0, 500)), visible))
      return rows.map(toItem)
    },

    async get(id: string): Promise<MediaItem | undefined> {
      const [row] = await db.select().from(media).where(mine(id)).limit(1)
      return row && toItem(row)
    },

    /** A page of media, newest first unless sorted: the content API's query language on the media fields. */
    async list(query: ListQuery & { filter?: Filter } = {}): Promise<{ items: MediaItem[], total: number, next: string | null }> {
      const where = and(query.filter ? compileFilter(context, query.filter) : undefined, visible)
      const keys = compileSort(context, query.sort?.length ? query.sort : ['-_createdAt'])
      const limit = query.limit ?? 50
      const page = query.cursor ? and(where, afterCursor(keys, decodeCursor(query.cursor, keys))) : where
      let select = db.select().from(media).where(page).orderBy(...orderBy(keys)).limit(limit + 1)
      if (!query.cursor && query.offset)
        select = select.offset(query.offset)
      const rows: Record<string, unknown>[] = await select
      const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(media).where(where)
      const items = rows.slice(0, limit)
      const last = items.at(-1)
      return {
        items: items.map(toItem),
        total: Number(count),
        next: rows.length > limit && last ? encodeCursor(keys.map(k => last[k.name] ?? null)) : null,
      }
    },

    async update(id: string, changes: MediaChanges): Promise<MediaItem | undefined> {
      await db.update(media).set({ ...changes, _updatedAt: new Date().toISOString() }).where(mine(id))
      return this.get(id)
    },

    /**
     * Where an item is used: each entry (or singleton: `id` is its name) and the field holding it, in drafts
     * and in what the site serves.
     */
    async usage(id: string): Promise<{ type: string, id: string, field: string }[]> {
      const found = new Map<string, { type: string, id: string, field: string }>()
      for (const table of [relations, publishedRelations]) {
        const rows: { source: string, sourceId: string, field: string }[] = await db.select({ source: table.source, sourceId: table.sourceId, field: table.field }).from(table)
          .where(and(eq(table.target, MEDIA_TARGET), eq(table.targetId, id)))
        for (const row of rows)
          found.set(`${row.source}\0${row.sourceId}\0${row.field}`, { type: row.source, id: row.sourceId, field: row.field })
      }
      return [...found.values()].toSorted((a, b) => `${a.type}${a.id}${a.field}`.localeCompare(`${b.type}${b.id}${b.field}`))
    },

    /** Removes the file and its row. */
    async delete(id: string): Promise<boolean> {
      const item = await this.get(id)
      if (!item)
        return false
      await db.delete(media).where(mine(id))
      // the original and its image variants share its folder
      await (storage.deletePrefix ? storage.deletePrefix(`${item.id}/`) : storage.delete(item.key))
      return true
    },
  }
}

export type MediaLibrary = ReturnType<typeof createMediaLibrary>
