// The same entry types from the app side
import type { CollectionEntry } from '#atelier'

export function appChecks(article: CollectionEntry<'articles'>) {
  const title: string = article.title
  // @ts-expect-error not a field of articles
  void article.summary
  return title
}
