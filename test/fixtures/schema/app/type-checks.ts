// The same entry types from the app side
import type { CollectionEntry } from '#atelier'

export function appChecks(article: CollectionEntry<'articles'>) {
  const title: string = article.title
  // @ts-expect-error not a field of articles
  void article.summary
  return title
}

export function queryChecks() {
  const { data } = useAtelierQuery('articles', { filter: { title: { contains: 'x' } }, sort: ['title'] })
  const title: string | undefined = data.value?.items[0]?.data.title
  // @ts-expect-error no field "summary"
  useAtelierQuery('articles', { filter: { summary: { eq: 'x' } } })
  const { data: one } = useAtelierEntry('articles', 'id')
  const status: 'draft' | 'published' | undefined = one.value?.data.status
  return [title, status] as const
}
