// Type-level checks for the generated entry types (run by `nuxt typecheck`, never executed)
import type { CollectionEntry, SingletonEntry } from '#atelier/server'
import { getEntry, queryEntries } from '#atelier/server'

export function checks(article: CollectionEntry<'articles'>, settings: SingletonEntry<'settings'>, author: CollectionEntry<'authors'>) {
  const title: string = article.title
  const status: 'draft' | 'published' = article.status
  const tags: string[] | null | undefined = article.tags
  const authorId: string | null | undefined = article.author
  const question: string | undefined = article.faq?.[0]?.question
  const siteName: string | null | undefined = settings.siteName
  const name: string | null | undefined = author.name
  // @ts-expect-error not a field of articles
  void article.summary
  // @ts-expect-error status is a fixed set of values
  const bad: typeof article.status = 'archived'
  return [title, status, tags, authorId, question, siteName, name, bad] as const
}

// @ts-expect-error no such collection
export type Nope = CollectionEntry<'nope'>

export function editable(article: CollectionEntry<'articles'>) {
  article.title = 'Edited'
  article.faq = [{ question: 'Q' }]
  article.faq[0]!.question = 'Edited'
}

// Typed queries: filters, sorts and field selections only take the collection's fields
export async function queryChecks() {
  const page = await queryEntries('articles', { filter: { status: { eq: 'published' }, title: { contains: 'news' } }, sort: ['-_createdAt', 'title'], fields: ['title'] })
  const title: string = page.items[0]!.data.title
  const authorId: string | null | undefined = page.items[0]!.data.author
  // @ts-expect-error no field "summary"
  await queryEntries('articles', { filter: { summary: { eq: 'x' } } })
  // @ts-expect-error status is a fixed set of values
  await queryEntries('articles', { filter: { status: { eq: 'archived' } } })
  // @ts-expect-error can't sort by a field that doesn't exist
  await queryEntries('articles', { sort: ['-summary'] })
  // @ts-expect-error no such collection
  await queryEntries('nope')

  const populated = await queryEntries('articles', { depth: 1 })
  const author = populated.items[0]!.data.author
  const name: unknown = author && typeof author === 'object' ? author.data.name : author
  const entry = await getEntry('articles', 'id', { depth: 1 })
  const tags = entry?.data.tags?.map(tag => typeof tag === 'string' ? tag : tag.id)
  return [title, authorId, name, tags] as const
}
