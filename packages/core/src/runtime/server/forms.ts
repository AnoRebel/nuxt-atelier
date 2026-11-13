// Form submissions: stored with the form's version and locale, their files in storage under
// `forms/<submission>/` (never served publicly: only the submissions API hands them out), deleted after the
// form's retention period or on an erasure request. Plus the optional challenge (Turnstile, or your own).
import type { AtelierDriver } from './db/driver'
import type { Db } from './db/entries'
import type { StorageDriver } from './media/storage'
import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm'
import { buildTables } from './db/tables'

export interface StoredFileInfo { name: string, type: string, size: number, key: string }
export interface Submission {
  id: string
  form: string
  version: number
  locale: string
  /** Values by field name; a file field holds `{ name, type, size, key }`. */
  data: Record<string, unknown>
  createdAt: string
}

const filesOf = (data: Record<string, unknown>) => Object.values(data).filter((v): v is StoredFileInfo =>
  !!v && typeof v === 'object' && typeof (v as StoredFileInfo).key === 'string')

export function createSubmissionStore(driver: AtelierDriver, storage: () => Promise<StorageDriver>) {
  const { atelier_form_submissions: table } = buildTables(driver.dialect, { collections: {}, singletons: {} })
  const db = driver.db as Db
  const toSubmission = (r: Record<string, unknown>): Submission => ({
    id: String(r._id),
    form: String(r.form),
    version: Number(r.version),
    locale: String(r.locale),
    data: (typeof r.data === 'string' ? JSON.parse(r.data) : r.data) as Record<string, unknown>,
    createdAt: String(r.createdAt),
  })
  /** Deletes submissions and their files. */
  async function remove(rows: Submission[]): Promise<number> {
    if (!rows.length)
      return 0
    const files = await storage()
    for (const row of rows) {
      for (const file of filesOf(row.data))
        await files.delete(file.key)
    }
    for (let i = 0; i < rows.length; i += 500)
      await db.delete(table).where(inArray(table._id, rows.slice(i, i + 500).map(r => r.id)))
    return rows.length
  }

  return {
    async add(input: Omit<Submission, 'createdAt'> & { emails: string[] }): Promise<Submission> {
      const createdAt = new Date().toISOString()
      await db.insert(table).values({ _id: input.id, form: input.form, version: input.version, locale: input.locale, data: input.data, emails: `,${input.emails.join(',')},`, createdAt })
      return { id: input.id, form: input.form, version: input.version, locale: input.locale, data: input.data, createdAt }
    },
    async get(id: string): Promise<Submission | undefined> {
      const [row] = await db.select().from(table).where(eq(table._id, id))
      return row ? toSubmission(row) : undefined
    },
    /**
     * A form's submissions, newest first: from and to (ISO dates, inclusive), text found anywhere in the
     * values (`q`), a page of `limit` after `offset`.
     */
    async list(form: string, options: { from?: string, to?: string, q?: string, limit?: number, offset?: number } = {}): Promise<{ items: Submission[], total: number }> {
      const rows: Submission[] = (await db.select().from(table).where(eq(table.form, form)).orderBy(desc(table.createdAt))).map(toSubmission)
      // ponytail: dates and text are filtered here, after one query per form; a submissions page past ~100k rows wants them in SQL
      const q = options.q?.toLowerCase()
      const matching = rows.filter(r => (!options.from || r.createdAt >= options.from)
        && (!options.to || r.createdAt.slice(0, 10) <= options.to.slice(0, 10))
        && (!q || JSON.stringify(r.data).toLowerCase().includes(q)))
      const offset = options.offset ?? 0
      return { items: matching.slice(offset, offset + (options.limit ?? matching.length)), total: matching.length }
    },
    async delete(id: string): Promise<boolean> {
      const row = await this.get(id)
      return !!row && await remove([row]) > 0
    },
    /** Deletes a form's submissions older than `before` (the retention job). */
    async deleteBefore(form: string, before: Date): Promise<number> {
      const rows = await db.select().from(table).where(and(eq(table.form, form), lt(table.createdAt, before.toISOString())))
      return remove(rows.map(toSubmission))
    },
    /** Deletes every submission, of any form, holding `email` in an email field: an erasure request. */
    async erase(email: string): Promise<number> {
      // `!` escapes the wildcards: the same on every engine (SQLite has no default escape character)
      const needle = email.trim().toLowerCase().replace(/[!%_]/g, c => `!${c}`)
      const rows = await db.select().from(table).where(sql`${table.emails} like ${`%,${needle},%`} escape '!'`)
      return remove(rows.map(toSubmission))
    },
    /** A file a submission holds, by field name. */
    async file(submission: Submission, field: string) {
      const info = submission.data[field] as StoredFileInfo | undefined
      if (!info || typeof info.key !== 'string')
        return undefined
      const stored = await (await storage()).get(info.key)
      return stored && { ...stored, info }
    },
  }
}

export type SubmissionStore = ReturnType<typeof createSubmissionStore>

// --- challenges: a check the visitor passes in the browser, verified here

export interface ChallengeAdapter {
  /** `turnstile`, or your own provider's name: the form block renders its widget by this name. */
  name: string
  /** The public key the widget needs. */
  siteKey: string
  /** Whether the token the widget produced is genuine. */
  verify: (token: string, ip: string) => Promise<boolean>
}

/** Cloudflare Turnstile, verified with its siteverify endpoint. */
export function turnstileChallenge(options: { siteKey: string, secret: string, fetch?: typeof fetch, endpoint?: string }): ChallengeAdapter {
  return {
    name: 'turnstile',
    siteKey: options.siteKey,
    async verify(token, ip) {
      const body = new URLSearchParams({ secret: options.secret, response: token, remoteip: ip })
      const response = await (options.fetch ?? fetch)(options.endpoint ?? 'https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body })
      if (!response.ok)
        return false
      return ((await response.json()) as { success?: boolean }).success === true
    },
  }
}

declare module 'nuxt/schema' {
  interface NuxtServerHooks {
    /** After a form submission is stored: `form` is the form's id. Errors are logged; the submission stands. */
    'atelier:formSubmitted': (context: { form: string, submission: Submission }) => void | Promise<void>
  }
}
