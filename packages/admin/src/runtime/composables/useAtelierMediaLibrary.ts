// The media library: a page of items with search and filters, uploads (in resumable chunks when large, with
// progress), editing an item's description, where it's used, and deleting it. Browsing is for everyone
// signed in; changing it takes the `media` capability (the server checks).
import type { MediaSummary } from '#atelier/shared/query'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, reactive, ref, watch } from 'vue'
import { refDebounced } from './debounced'
import { atelierFetch } from './useAtelierAdmin'

export interface MediaItem extends MediaSummary {
  size: number
  folder: string
  tags: string[]
  private: boolean
  createdAt: string
  updatedAt: string
}
export interface MediaChanges {
  title?: string | null
  alt?: Record<string, string> | null
  caption?: string | null
  credits?: string | null
  folder?: string
  tags?: string[]
  focal?: { x: number, y: number } | null
  private?: boolean
}
export interface MediaUsage { type: string, id: string, field: string }

export interface MediaListState {
  search: string
  folder: string
  tag: string
  /** `image`, `video`, `audio`, `application/pdf`, or '' for every kind. */
  kind: string
  page: number
  pageSize: number
}

/** Files above this go up in resumable chunks of this size. */
export const CHUNK = 5 * 1024 * 1024

export function useAtelierMediaLibrary(initial: Partial<MediaListState> = {}) {
  const client = useQueryClient()
  const state = reactive<MediaListState>({ search: '', folder: '', tag: '', kind: '', page: 1, pageSize: 40, ...initial })
  const search = refDebounced(computed(() => state.search.trim()), 250)
  watch(() => [search.value, state.folder, state.tag, state.kind], () => state.page = 1)

  const filter = computed(() => {
    const parts = [
      search.value ? { or: ['filename', 'title', 'caption', 'credits'].map(f => ({ [f]: { contains: search.value } })) } : undefined,
      state.folder ? { folder: { eq: state.folder } } : undefined,
      state.tag ? { tags: { contains: state.tag } } : undefined,
      state.kind ? { mime: { contains: state.kind } } : undefined,
    ].filter(Boolean)
    return parts.length > 1 ? { and: parts } : parts[0]
  })
  const params = computed(() => ({ limit: state.pageSize, offset: (state.page - 1) * state.pageSize, ...filter.value ? { filter: JSON.stringify(filter.value) } : {} }))
  const list = useQuery({
    queryKey: ['atelier', 'media', 'list', params],
    queryFn: () => atelierFetch<{ items: MediaItem[], total: number }>('/media', { query: params.value }),
    placeholderData: keepPreviousData,
  })
  const refresh = () => client.invalidateQueries({ queryKey: ['atelier', 'media'] })

  /** Uploads in progress, by file name: the share sent so far, 0 to 1. */
  const progress = ref<Record<string, number>>({})
  async function upload(file: File, options: { folder?: string, private?: boolean } = {}): Promise<MediaItem> {
    const set = (share: number) => progress.value = { ...progress.value, [file.name]: share }
    set(0)
    try {
      if (file.size <= CHUNK) {
        // the body is the file
        const query = { filename: file.name, ...options.folder ? { folder: options.folder } : {}, ...options.private ? { private: 'true' } : {} }
        const item = await atelierFetch<MediaItem>('/media', { method: 'POST', query, body: file })
        set(1)
        return item
      }
      const session = await atelierFetch<{ id: string }>('/media/uploads', { method: 'POST', body: { filename: file.name, size: file.size, ...options } })
      let offset = 0
      while (offset < file.size) {
        try {
          await atelierFetch(`/media/uploads/${session.id}`, { method: 'PUT', query: { offset }, body: file.slice(offset, offset + CHUNK) })
          offset = Math.min(file.size, offset + CHUNK)
        }
        catch (error) {
          // a chunk the server got some of (a dropped connection): carry on from where it stands
          const status = await atelierFetch<{ received: number }>(`/media/uploads/${session.id}`).catch(() => undefined)
          if (!status || status.received === offset)
            throw error
          offset = status.received
        }
        set(offset / file.size)
      }
      return await atelierFetch<MediaItem>(`/media/uploads/${session.id}/complete`, { method: 'POST' })
    }
    finally {
      const { [file.name]: _, ...rest } = progress.value
      progress.value = rest
      await refresh()
    }
  }

  return {
    state,
    items: computed(() => list.data.value?.items ?? []),
    total: computed(() => list.data.value?.total ?? 0),
    pages: computed(() => Math.max(1, Math.ceil((list.data.value?.total ?? 0) / state.pageSize))),
    loading: list.isPending,
    upload,
    progress,
    update: useMutation({
      mutationFn: ({ id, changes }: { id: string, changes: MediaChanges }) => atelierFetch<MediaItem>(`/media/${encodeURIComponent(id)}`, { method: 'PATCH', body: changes }),
      onSuccess: refresh,
    }),
    usage: (id: string) => atelierFetch<MediaUsage[]>(`/media/${encodeURIComponent(id)}/usage`),
    /** Deletes an item; refused (409 `referenced`, with `usages`) while entries use it, unless `force`. */
    remove: useMutation({
      mutationFn: ({ id, force }: { id: string, force?: boolean }) => atelierFetch(`/media/${encodeURIComponent(id)}`, { method: 'DELETE', ...force ? { query: { force: 'true' } } : {} }),
      onSuccess: refresh,
    }),
  }
}

/** One media item, for a media field's preview. */
export function useAtelierMediaItem(id: () => string | null | undefined) {
  return useQuery({
    queryKey: ['atelier', 'media', 'item', computed(() => id() ?? '')],
    queryFn: () => atelierFetch<MediaItem>(`/media/${encodeURIComponent(id()!)}`),
    enabled: computed(() => !!id()),
  })
}
