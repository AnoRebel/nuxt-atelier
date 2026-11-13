// The signed-in user's notifications (mentions, replies, lock takeovers), pushed through their own
// real-time topic where the connection is up, polled otherwise.
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, onBeforeUnmount, watch } from 'vue'
import { atelierFetch } from './useAtelierAdmin'
import { useAtelierRealtime } from './useAtelierRealtime'
import { useAtelierSession } from './useAtelierSession'

export interface AdminNotification {
  id: string
  kind: 'mention' | 'reply' | 'takeover'
  data: { type: string, entry: string, by: string, byName: string, comment?: string, thread?: string, excerpt?: string }
  readAt: string | null
  createdAt: string
}

export function useAtelierNotifications() {
  const client = useQueryClient()
  const realtime = useAtelierRealtime()
  const { user } = useAtelierSession()
  const queryKey = ['atelier', 'notifications']
  const query = useQuery({
    queryKey,
    queryFn: () => atelierFetch<{ items: AdminNotification[], unread: number }>('/notifications', { query: { limit: 20 } }),
    enabled: computed(() => !!user.value),
    refetchInterval: () => realtime.pollInterval(),
  })
  let unfollow = () => {}
  watch(() => user.value?.id, (id) => {
    unfollow()
    unfollow = id ? realtime.follow(`user:${id}`, () => void query.refetch()) : () => {}
  }, { immediate: true })
  onBeforeUnmount(() => unfollow())

  return {
    items: computed(() => query.data.value?.items ?? []),
    unread: computed(() => query.data.value?.unread ?? 0),
    /** Marks these notifications read, or all of them. */
    markRead: useMutation({
      mutationFn: (ids?: string[]) => atelierFetch('/notifications/read', { method: 'POST', body: ids ? { ids } : {} }),
      onSuccess: () => client.invalidateQueries({ queryKey }),
    }),
  }
}
