// An entry's comment threads: on the entry or one of its blocks, with replies, mentions and resolving.
// Changes from others arrive through the entry's real-time topic (useAtelierPresence) or polling.
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import { atelierFetch } from './useAtelierAdmin'
import { useAtelierRealtime } from './useAtelierRealtime'

export interface EntryComment {
  id: string
  block: string | null
  thread: string | null
  author: string
  authorName: string
  body: string
  mentions: string[]
  resolvedAt: string | null
  resolvedBy: string | null
  createdAt: string
  /** About a block that's no longer in the entry. */
  orphaned: boolean
}
export interface CommentThread extends EntryComment { replies: EntryComment[] }

export function useAtelierComments(target: MaybeRefOrGetter<{ type: string, id: string } | null>) {
  const client = useQueryClient()
  const realtime = useAtelierRealtime()
  const t = computed(() => toValue(target))
  const path = computed(() => t.value ? `/comments/${encodeURIComponent(t.value.type)}/${encodeURIComponent(t.value.id)}` : '')
  const queryKey = computed(() => ['atelier', 'comments', t.value?.type ?? '', t.value?.id ?? ''])
  const query = useQuery({
    queryKey,
    queryFn: () => atelierFetch<EntryComment[]>(path.value),
    enabled: computed(() => !!t.value),
    refetchInterval: () => realtime.pollInterval(),
  })
  const people = useQuery({
    queryKey: computed(() => ['atelier', 'collab', 'people', t.value?.type ?? '', t.value?.id ?? '']),
    queryFn: () => atelierFetch<{ id: string, name: string }[]>(`/collab/${encodeURIComponent(t.value!.type)}/${encodeURIComponent(t.value!.id)}/people`),
    enabled: computed(() => !!t.value),
    staleTime: 5 * 60_000,
  })
  const refresh = () => client.invalidateQueries({ queryKey: queryKey.value })

  return {
    /** Threads, oldest first, each with its replies. */
    threads: computed<CommentThread[]>(() => {
      const all = query.data.value ?? []
      return all.filter(c => !c.thread).map(c => ({ ...c, replies: all.filter(r => r.thread === c.id) }))
    }),
    loading: query.isPending,
    /** Who can be mentioned: users who may read the entry. */
    people: computed(() => people.data.value ?? []),
    add: useMutation({
      mutationFn: (input: { body: string, block?: string | null, thread?: string | null, mentions?: string[] }) => atelierFetch<EntryComment>(path.value, { method: 'POST', body: input }),
      onSuccess: refresh,
    }),
    resolve: useMutation({
      mutationFn: ({ id, resolved }: { id: string, resolved: boolean }) => atelierFetch(`${path.value}/${encodeURIComponent(id)}`, { method: 'PATCH', body: { resolved } }),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (id: string) => atelierFetch(`${path.value}/${encodeURIComponent(id)}`, { method: 'DELETE' }),
      onSuccess: refresh,
    }),
  }
}
