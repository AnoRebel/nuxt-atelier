// Site search: the index kept in step with what the site serves, and queries over it. Only what visitors
// may read is indexed: types the public role reads, without the fields hidden from it.
import type { StoreChange } from '../db/store'
import type { SiteContext } from '../sites'
import { siteScoped } from '../db/tables'
import type { SearchAdapter, SearchHit } from './adapter'
import { PUBLIC_ROLE } from '../../shared/policy'
import { useAtelierDatabase, useAtelierEntries, useAtelierPolicy, useAtelierSchema } from '../index'
import { logger } from '../logger'
import { createDatabaseSearch } from './adapter'
import { isSearchable, searchText, terms } from './text'

let adapter: Promise<SearchAdapter> | undefined
let custom: (() => SearchAdapter | Promise<SearchAdapter>) | undefined

/** Search with another engine (Meilisearch, Algolia…) instead of the database: call in a server plugin. */
export function registerSearchAdapter(factory: () => SearchAdapter | Promise<SearchAdapter>): void {
  custom = factory
  adapter = undefined
}

/** The site search adapter in use: the built-in one on your database, or one registered with `registerSearchAdapter()`. */
export function useAtelierSearch(): Promise<SearchAdapter> {
  adapter ??= (async () => custom ? custom() : createDatabaseSearch(await useAtelierDatabase()))().catch((error) => {
    adapter = undefined
    throw error
  })
  return adapter
}

const VISITOR = { id: '', role: PUBLIC_ROLE }

/**
 * The type an entry is indexed under: with sites, a site-scoped type's is qualified by its site (`shop/posts`),
 * so one index serves every site and a search only finds its own site's and shared types' entries.
 */
async function indexedType(site: SiteContext, type: string): Promise<string> {
  const schema = await useAtelierSchema()
  return siteScoped(schema, schema.collections[type] ?? schema.singletons[type]) ? `${site.name}/${type}` : type
}
const typeOfIndexed = (indexed: string) => indexed.slice(indexed.indexOf('/') + 1)

/** The types visitors search: searchable, and readable by the public role. */
async function searchableTypes(): Promise<{ collections: string[], singletons: string[] }> {
  const { collections, singletons } = await useAtelierSchema()
  const policy = await useAtelierPolicy()
  const pick = (types: Record<string, { fields: Parameters<typeof isSearchable>[0] }>) =>
    Object.entries(types).filter(([name, d]) => isSearchable(d.fields) && policy.can(VISITOR, 'read', name)).map(([name]) => name)
  return { collections: pick(collections), singletons: pick(singletons) }
}

/** Indexes (or removes) what an entry or singleton serves now, on `site`. */
async function reindex(site: SiteContext, type: string, id: string): Promise<void> {
  const { collections, singletons } = await useAtelierSchema()
  const search = await useAtelierSearch()
  const entries = await useAtelierEntries(site)
  const policy = await useAtelierPolicy()
  const definition = collections[type] ?? singletons[type]
  const indexed = await indexedType(site, type)
  // a singleton is indexed once per site: its id carries the site
  const key = type in singletons ? (indexed === type ? type : `${type}@${site.name}`) : id
  if (!definition || !isSearchable(definition.fields) || !policy.can(VISITOR, 'read', type))
    return search.remove(indexed, key)
  const hidden = policy.fields(VISITOR, type).hidden
  if (type in singletons) {
    const singleton = await entries.getSingleton(type, { stage: 'published' })
    if (!singleton || singleton.publishedVersion === null)
      return search.remove(indexed, key)
    return search.index({ type: indexed, id: key, locale: '', ...searchText(definition.fields, singleton.data, hidden) })
  }
  const entry = await entries.get(type, id, { stage: 'published' })
  if (!entry)
    return search.remove(indexed, key)
  await search.index({ type: indexed, id, locale: entry.locale ?? '', ...searchText(definition.fields, entry.data, hidden) })
}

/** Keeps the index in step with a committed write: publishing, unpublishing, deleting. Never throws. */
export async function indexChange(change: StoreChange): Promise<void> {
  if (!change.live && change.action !== 'deleted')
    return
  try {
    await reindex(change.site, change.type, change.id)
  }
  catch (error) {
    // an app that hasn't generated the search migration yet has no index: publishing goes on regardless
    logger.warn(`Search index not updated for ${change.type} "${change.id}" (rebuild it later)`, { error })
  }
}

const PAGE = 200

/**
 * Empties the index and indexes every published, searchable entry again: of every site (`sites`, all of them;
 * without sites, the one).
 */
export async function rebuildSearchIndex(sites: SiteContext[]): Promise<{ indexed: number }> {
  const search = await useAtelierSearch()
  await search.clear()
  let indexed = 0
  for (const site of sites)
    indexed += await indexSite(site)
  return { indexed }
}

async function indexSite(site: SiteContext): Promise<number> {
  const entries = await useAtelierEntries(site)
  const { collections, locales } = await useAtelierSchema()
  const types = await searchableTypes()
  let indexed = 0
  for (const type of types.collections) {
    for (const locale of collections[type]!.localized ? locales.codes : [undefined]) {
      for (let offset = 0; ; offset += PAGE) {
        const page = await entries.list(type, { stage: 'published', limit: PAGE, offset, ...locale ? { locale } : {} })
        for (const entry of page.items) {
          if (locale && entry.locale !== locale)
            continue // a fallback, not this locale's own version
          await reindex(site, type, entry.id)
          indexed++
        }
        if (offset + PAGE >= page.total)
          break
      }
    }
  }
  for (const type of types.singletons) {
    await reindex(site, type, type)
    indexed++
  }
  return indexed
}

export interface SearchResult {
  type: string
  id: string
  locale?: string
  title: string
  /** The page's address, for routable types. */
  path: string | null
  /** Around the match, with `<mark>` around the matched words; the rest HTML-escaped. */
  excerpt: string
  score: number
}

const titleOf = (data: Record<string, unknown>) =>
  String(['title', 'name', 'label', 'headline'].map(k => data[k]).find(v => typeof v === 'string' && v) ?? '')

/** Published entries visitors may read, matching `query`, best first. */
export async function searchSite(site: SiteContext, query: string, options: { types?: string[], locale?: string, limit: number, offset: number }): Promise<{ items: SearchResult[], total: number }> {
  const words = terms(query)
  const available = await searchableTypes()
  const all = [...available.collections, ...available.singletons]
  const types = options.types?.length ? all.filter(t => options.types!.includes(t)) : all
  if (!words.length || !types.length)
    return { items: [], total: 0 }
  const indexed = await Promise.all(types.map(type => indexedType(site, type)))
  const found = await (await useAtelierSearch()).search({ terms: words, types: indexed, locale: options.locale, limit: options.limit, offset: options.offset })
  const total = found.total
  const hits = found.hits.map(hit => ({ ...hit, type: typeOfIndexed(hit.type), id: hit.id.replace(/@[^@]*$/, '') }))
  const entries = await useAtelierEntries(site)
  const policy = await useAtelierPolicy()
  const items = await Promise.all(hits.map(async (hit: SearchHit): Promise<SearchResult | undefined> => {
    const entry = available.singletons.includes(hit.type)
      ? await entries.getSingleton(hit.type, { stage: 'published' })
      : await entries.get(hit.type, hit.id, { stage: 'published' })
    if (!entry)
      return undefined // unpublished since it was indexed
    const data = policy.readable(VISITOR, hit.type, entry.data)
    return { type: hit.type, id: hit.id, ...hit.locale ? { locale: hit.locale } : {}, title: titleOf(data), path: entry.path ?? null, excerpt: hit.excerpt, score: hit.score }
  }))
  return { items: items.filter((i): i is SearchResult => !!i), total }
}
