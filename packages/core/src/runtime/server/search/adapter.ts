// Search on the app's own database, with each engine's full-text search (text.ts has the tables). Queries
// are plain terms (text.ts `terms`), bound as parameters or reduced to letters and digits before they
// reach the engine's query syntax.
import type { SQL } from 'drizzle-orm'
import type { AtelierDriver } from '../db/driver'
import type { SearchText } from './text'
import { sql } from 'drizzle-orm'
import { excerptOf, MARK_END, MARK_START, markExcerpt } from './text'

/** One entry version's text: `id` the entry (or singleton) id, `locale` '' outside localized types. */
export interface SearchDocument extends SearchText { type: string, id: string, locale: string }

export interface SearchQuery {
  /** The query's terms (text.ts `terms`): every one must match, the last as a prefix. */
  terms: string[]
  /** Only these types. */
  types: string[]
  /** This locale's versions, and entries of types that aren't localized. */
  locale?: string
  limit: number
  offset: number
}

export interface SearchHit { type: string, id: string, locale: string, score: number, excerpt: string }

/** A search engine: the built-in one on the app's database, or an external service (Meilisearch, Algolia…). */
export interface SearchAdapter {
  name: string
  /** Adds or replaces a document. */
  index: (document: SearchDocument) => Promise<void>
  /** Removes an entry's documents (every locale), or one locale's. */
  remove: (type: string, id: string, locale?: string) => Promise<void>
  /** Removes every document, or a type's. */
  clear: (type?: string) => Promise<void>
  search: (query: SearchQuery) => Promise<{ hits: SearchHit[], total: number }>
}

const keyOf = (d: { type: string, id: string, locale: string }) => `${d.type}:${d.id}:${d.locale}`
// letters and digits only: the engines' operators can't be spelt with them
const safe = (term: string) => term.replace(/[^\p{L}\p{N}]/gu, '')

async function rows(driver: AtelierDriver, query: SQL): Promise<Record<string, unknown>[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the dialects' raw query methods differ
  const db = driver.db as any
  if (driver.dialect === 'sqlite')
    return db.all(query)
  return driver.dialect === 'mysql' ? (await db.execute(query))[0] : (await db.execute(query)).rows
}
async function run(driver: AtelierDriver, query: SQL): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- as above
  const db = driver.db as any
  await (driver.dialect === 'sqlite' ? db.run(query) : db.execute(query))
}

// `key` is a reserved word in MySQL: always quoted, as each dialect quotes
const KEY = sql.identifier('key')

const MYSQL_MIN_TOKEN = 3 // InnoDB's default innodb_ft_min_token_size: shorter words aren't indexed

export function createDatabaseSearch(driver: AtelierDriver): SearchAdapter {
  const { dialect } = driver
  const where = (q: SearchQuery) => sql.join([
    sql`type in (${sql.join(q.types.map(t => sql`${t}`), sql`, `)})`,
    ...q.locale ? [sql`(locale = ${q.locale} or locale = '')`] : [],
  ], sql` and `)

  return {
    name: 'database',

    async index(d) {
      const key = keyOf(d)
      // FTS5 tables have no unique constraint to upsert on: delete, then insert (every engine, for one path)
      await run(driver, sql`delete from atelier_search where ${KEY} = ${key}`)
      if (d.a || d.b || d.c)
        await run(driver, sql`insert into atelier_search (${KEY}, type, entry, locale, a, b, c) values (${key}, ${d.type}, ${d.id}, ${d.locale}, ${d.a}, ${d.b}, ${d.c})`)
    },

    async remove(type, id, locale) {
      await run(driver, locale === undefined
        ? sql`delete from atelier_search where type = ${type} and entry = ${id}`
        : sql`delete from atelier_search where ${KEY} = ${keyOf({ type, id, locale })}`)
    },

    async clear(type) {
      await run(driver, type === undefined ? sql`delete from atelier_search` : sql`delete from atelier_search where type = ${type}`)
    },

    async search(q) {
      const words = q.terms.map(safe).filter(w => dialect !== 'mysql' || w.length >= MYSQL_MIN_TOKEN)
      if (!words.length || !q.types.length)
        return { hits: [], total: 0 }
      const filter = where(q)

      if (dialect === 'sqlite') {
        // FTS5: every term quoted (a phrase of one word), the last one a prefix
        const match = words.map((w, i) => `"${w}"${i === words.length - 1 ? '*' : ''}`).join(' ')
        const condition = sql`atelier_search match ${match} and ${filter}`
        const [count] = await rows(driver, sql`select count(*) as n from atelier_search where ${condition}`)
        const found = await rows(driver, sql`select type, entry, locale, bm25(atelier_search, 0, 0, 0, 0, 3, 2, 1) as score,
          snippet(atelier_search, -1, ${MARK_START}, ${MARK_END}, '…', 24) as excerpt
          from atelier_search where ${condition} order by score limit ${q.limit} offset ${q.offset}`)
        return { total: Number(count?.n ?? 0), hits: found.map(r => ({ type: String(r.type), id: String(r.entry), locale: String(r.locale), score: -Number(r.score), excerpt: markExcerpt(String(r.excerpt ?? '')) })) }
      }

      if (dialect === 'postgres') {
        // tsquery from letters and digits only: `w1 & w2:*`
        const tsquery = words.map((w, i) => `${w}${i === words.length - 1 ? ':*' : ''}`).join(' & ')
        const query = sql`to_tsquery('simple', ${tsquery})`
        const condition = sql`document @@ ${query} and ${filter}`
        const [count] = await rows(driver, sql`select count(*) as n from atelier_search where ${condition}`)
        const found = await rows(driver, sql`select type, entry, locale, ts_rank(document, ${query}) as score,
          ts_headline('simple', translate(concat_ws(' ', a, b, c), '<>', chr(3) || chr(4)), ${query}, ${`StartSel=${MARK_START}, StopSel=${MARK_END}, MaxWords=30, MinWords=12, ShortWord=2`}) as excerpt
          from atelier_search where ${condition} order by score desc, ${KEY} limit ${q.limit} offset ${q.offset}`)
        // `<` and `>` went in as \u0003 and \u0004: ts_headline's parser drops anything that looks like a tag
        const unhidden = (excerpt: unknown) => String(excerpt ?? '').replaceAll('\u0003', '<').replaceAll('\u0004', '>')
        return { total: Number(count?.n ?? 0), hits: found.map(r => ({ type: String(r.type), id: String(r.entry), locale: String(r.locale), score: Number(r.score), excerpt: markExcerpt(unhidden(r.excerpt)) })) }
      }

      // MySQL and MariaDB: boolean mode, every term required, the last a prefix; weights by column
      const against = words.map((w, i) => `+${w}${i === words.length - 1 ? '*' : ''}`).join(' ')
      const condition = sql`match (a, b, c) against (${against} in boolean mode) and ${filter}`
      const [count] = await rows(driver, sql`select count(*) as n from atelier_search where ${condition}`)
      const found = await rows(driver, sql`select type, entry, locale, a, b, c,
        match (a) against (${against} in boolean mode) * 3 + match (b) against (${against} in boolean mode) * 2 + match (c) against (${against} in boolean mode) as score
        from atelier_search where ${condition} order by score desc, ${KEY} limit ${q.limit} offset ${q.offset}`)
      return {
        total: Number(count?.n ?? 0),
        hits: found.map(r => ({ type: String(r.type), id: String(r.entry), locale: String(r.locale), score: Number(r.score), excerpt: markExcerpt(excerptOf([r.a, r.b, r.c].filter(Boolean).join(' '), words)) })),
      }
    },
  }
}
