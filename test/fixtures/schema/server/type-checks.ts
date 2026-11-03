// Type-level checks for the generated entry types (run by `nuxt typecheck`, never executed)
import type { CollectionEntry, SingletonEntry } from '#atelier/server'

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
