// Search without the server runtime: what an entry's searchable text is, how a query becomes plain terms,
// and the search table for each engine.
import type { Dialect } from '../db/driver'
import type { Field, Fields } from '../../shared/fields'

/** An entry's searchable text, by weight: a (3), b (2), c (1). */
export interface SearchText { a: string, b: string, c: string }

const MAX_TEXT = 100_000 // per weight: enough for any page, a cap on a pathological one

/** All the text in a value: strings, rich text, and every string inside objects, lists and blocks. */
function textOf(value: unknown): string[] {
  if (typeof value === 'string')
    return [value]
  if (Array.isArray(value))
    return value.flatMap(textOf)
  if (value && typeof value === 'object') {
    const node = value as Record<string, unknown>
    // ProseMirror: the text of text nodes, a space between blocks
    if (typeof node.type === 'string' && (node.type === 'text' || Array.isArray(node.content)))
      return node.type === 'text' ? [String(node.text ?? '')] : (node.content as unknown[]).flatMap(textOf)
    // a block: its props, not its id and type; any other object: all its strings
    const block = typeof node.id === 'string' && typeof node.type === 'string'
    return Object.entries(node).filter(([key]) => !block || (key !== 'id' && key !== 'type')).flatMap(([, v]) => textOf(v))
  }
  return []
}

const TEXT_TYPES = new Set(['text', 'textarea', 'richText', 'email', 'url', 'slug', 'select', 'multiSelect', 'object', 'repeater', 'blocks'])
const weightOf = (field: Field) => field.searchable === true ? 1 : field.searchable || 0

/** The searchable text of entry data: each searchable field's text, at its weight. `hidden` fields are left out. */
export function searchText(fields: Fields, data: Record<string, unknown>, hidden: ReadonlySet<string> = new Set()): SearchText {
  const parts: Record<'a' | 'b' | 'c', string[]> = { a: [], b: [], c: [] }
  for (const [key, field] of Object.entries(fields)) {
    const weight = weightOf(field)
    if (!weight || hidden.has(key) || !TEXT_TYPES.has(field.type))
      continue
    parts[weight === 3 ? 'a' : weight === 2 ? 'b' : 'c'].push(...textOf(data[key]))
  }
  const join = (list: string[]) => list.map(s => s.trim()).filter(Boolean).join(' ').slice(0, MAX_TEXT)
  return { a: join(parts.a), b: join(parts.b), c: join(parts.c) }
}

/** Whether a type has anything to search. */
export const isSearchable = (fields: Fields) => Object.values(fields).some(f => weightOf(f) > 0)

export const MAX_QUERY = 200
const MAX_TERMS = 10

/**
 * A query as plain terms: letters and digits only, lowercased, at most 10. Operators, quotes and SQL are
 * dropped, never interpreted: they can't reach the engine's query syntax.
 */
export function terms(query: string): string[] {
  const words = query.slice(0, MAX_QUERY).normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
  return [...new Set(words.map(w => w.slice(0, 64)))].slice(0, MAX_TERMS)
}

/** Highlight marks the engines put around matches, turned into HTML here, after escaping the text. */
export const MARK_START = '\u0002'
export const MARK_END = '\u0003'
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[c]!)

/** An excerpt with its matches in <mark>, everything else escaped. */
export const markExcerpt = (excerpt: string) =>
  escapeHtml(excerpt.replace(/[\r\n\t]+/g, ' ')).replaceAll(MARK_START, '<mark>').replaceAll(MARK_END, '</mark>')

/** An excerpt worked out here (engines without one): the text around the first term, matches marked. */
export function excerptOf(text: string, words: string[], size = 160): string {
  const lower = text.toLowerCase()
  const at = Math.min(...words.map(w => lower.indexOf(w)).filter(i => i >= 0), Number.POSITIVE_INFINITY)
  const start = Number.isFinite(at) ? Math.max(0, at - 40) : 0
  let piece = text.slice(start, start + size)
  for (const w of words)
    piece = piece.replace(new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu'), m => `${MARK_START}${m}${MARK_END}`)
  return `${start > 0 ? '…' : ''}${piece}${start + size < text.length ? '…' : ''}`
}

/**
 * The search table, created once by a migration (`-- atelier:data search index`): each engine's own full-text
 * search. SQLite (and D1): an FTS5 table. Postgres: a weighted tsvector, GIN-indexed. MySQL and MariaDB:
 * FULLTEXT indexes, one per weight and one over all.
 */
export function searchTableSql(dialect: Dialect): string[] {
  if (dialect === 'sqlite') {
    return ['CREATE VIRTUAL TABLE IF NOT EXISTS atelier_search USING fts5(key UNINDEXED, type UNINDEXED, entry UNINDEXED, locale UNINDEXED, a, b, c, tokenize = \'unicode61 remove_diacritics 2\');']
  }
  if (dialect === 'postgres') {
    return [
      `CREATE TABLE IF NOT EXISTS atelier_search (key varchar(255) PRIMARY KEY, type varchar(64) NOT NULL, entry varchar(64) NOT NULL, locale varchar(35) NOT NULL, a text NOT NULL, b text NOT NULL, c text NOT NULL, document tsvector GENERATED ALWAYS AS (setweight(to_tsvector('simple', a), 'A') || setweight(to_tsvector('simple', b), 'B') || setweight(to_tsvector('simple', c), 'C')) STORED);`,
      'CREATE INDEX IF NOT EXISTS atelier_search_document_idx ON atelier_search USING GIN (document);',
      'CREATE INDEX IF NOT EXISTS atelier_search_entry_idx ON atelier_search (type, entry);',
    ]
  }
  return [
    'CREATE TABLE IF NOT EXISTS atelier_search (`key` varchar(255) PRIMARY KEY, type varchar(64) NOT NULL, entry varchar(64) NOT NULL, locale varchar(35) NOT NULL, a mediumtext NOT NULL, b mediumtext NOT NULL, c mediumtext NOT NULL, FULLTEXT INDEX atelier_search_all (a, b, c), FULLTEXT INDEX atelier_search_a (a), FULLTEXT INDEX atelier_search_b (b), FULLTEXT INDEX atelier_search_c (c), INDEX atelier_search_entry_idx (type, entry)) ENGINE=InnoDB;',
  ]
}
