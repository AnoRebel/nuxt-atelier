// A collection's list view state and data: page, page size, sort, search, filter and columns, the entries
// (drafts included: the admin edits drafts), and bulk publish, unpublish and delete reporting each failure.
import type { MaybeRefOrGetter } from 'vue'
import type { AdminApiError, CollectionType, Entry, EntryList } from '../types'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, reactive, toValue, watch } from 'vue'
import { atelierFetch } from './useAtelierAdmin'
import { useAtelierAdminSchema } from './useAtelierAdminSchema'

export interface ListState {
  page: number
  pageSize: number
  /** A field or `_createdAt`/`_updatedAt`, `-` first for descending. */
  sort: string
  search: string
  /** A filter in the API's shape, e.g. `{ category: { eq: 'news' } }`. */
  filter?: Record<string, unknown>
  /** The fields shown as columns. */
  columns: string[]
}

export interface BulkResult { succeeded: string[], failed: { id: string, error: AdminApiError }[] }

const TEXT = new Set(['text', 'slug', 'email', 'url', 'textarea'])

/** The field a list searches and shows first: `title`, `name`, else the first text field. */
export function titleField(type: CollectionType | undefined): string | undefined {
  if (!type)
    return undefined
  const keys = Object.keys(type.fields)
  return ['title', 'name', 'label'].find(k => k in type.fields) ?? keys.find(k => TEXT.has(type.fields[k]!.type))
}

export function useAtelierCollection(name: MaybeRefOrGetter<string>, initial: Partial<ListState> = {}) {
  const client = useQueryClient()
  const { schema } = useAtelierAdminSchema()
  const type = computed(() => schema.value?.collections.find(c => c.name === toValue(name)))
  const state = reactive<ListState>({ page: 1, pageSize: 25, sort: '-_updatedAt', search: '', columns: [], ...initial })

  // default columns: the type's `admin.columns`, else its title field
  watch(type, (t) => {
    if (t && !state.columns.length)
      state.columns = t.admin?.columns ?? [titleField(t)].filter((k): k is string => !!k)
  }, { immediate: true })
  watch(() => [state.search, state.filter, state.sort, state.pageSize], () => {
    state.page = 1
  })

  const filter = computed(() => {
    const search = state.search.trim()
    const field = titleField(type.value)
    const parts = [state.filter, search && field ? { [field]: { contains: search } } : undefined].filter(Boolean)
    return parts.length > 1 ? { and: parts } : parts[0]
  })
  const params = computed(() => ({
    draft: 'true',
    sort: state.sort,
    limit: state.pageSize,
    offset: (state.page - 1) * state.pageSize,
    ...filter.value ? { filter: JSON.stringify(filter.value) } : {},
  }))
  const list = useQuery({
    queryKey: ['atelier', 'collections', computed(() => toValue(name)), 'list', params],
    queryFn: () => atelierFetch<EntryList>(`/collections/${encodeURIComponent(toValue(name))}`, { query: params.value }),
    placeholderData: keepPreviousData,
    enabled: computed(() => !!type.value),
  })

  async function each(entries: Entry[], run: (entry: Entry) => Promise<unknown>): Promise<BulkResult> {
    const settled = await Promise.allSettled(entries.map(run))
    const result: BulkResult = { succeeded: [], failed: [] }
    settled.forEach((outcome, i) => outcome.status === 'fulfilled'
      ? result.succeeded.push(entries[i]!.id)
      : result.failed.push({ id: entries[i]!.id, error: outcome.reason as AdminApiError }))
    await client.invalidateQueries({ queryKey: ['atelier', 'collections', toValue(name)] })
    return result
  }
  const path = (entry: Entry, sub = '') => `/collections/${encodeURIComponent(toValue(name))}/${encodeURIComponent(entry.id)}${sub}`

  return {
    type,
    state,
    entries: computed(() => list.data.value?.items ?? []),
    total: computed(() => list.data.value?.total ?? 0),
    pages: computed(() => Math.max(1, Math.ceil((list.data.value?.total ?? 0) / state.pageSize))),
    loading: list.isPending,
    error: computed(() => list.error.value as AdminApiError | null),
    refresh: list.refetch,
    publish: useMutation({ mutationFn: (entries: Entry[]) => each(entries, e => atelierFetch(path(e, '/publish'), { method: 'POST', body: { version: e.version } })) }),
    unpublish: useMutation({ mutationFn: (entries: Entry[]) => each(entries, e => atelierFetch(path(e, '/unpublish'), { method: 'POST' })) }),
    remove: useMutation({ mutationFn: (entries: Entry[]) => each(entries, e => atelierFetch(path(e), { method: 'DELETE' })) }),
    /** The entries as a JSON or CSV file's contents (CSV: the visible columns, then id and dates). */
    exportEntries(entries: Entry[], format: 'json' | 'csv'): string {
      if (format === 'json')
        return JSON.stringify(entries, null, 2)
      const cell = (value: unknown) => {
        const text = value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value)
        return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
      }
      const header = ['id', ...state.columns, 'createdAt', 'updatedAt']
      return [header, ...entries.map(e => [e.id, ...state.columns.map(c => e.data[c]), e.createdAt, e.updatedAt])]
        .map(row => row.map(cell).join(',')).join('\r\n')
    },
  }
}
