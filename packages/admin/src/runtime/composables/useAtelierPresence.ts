// Who has an entry open, and its edit lock. While the entry is open the admin sends a heartbeat every 20
// seconds, renewing the lock when the user may edit and has been active within `collaboration.idleTimeout`;
// closing it gives the lock up. Someone else's lock makes the entry read-only, until it's released, expires,
// or is taken over (with the publish permission).
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, onBeforeUnmount, onMounted, ref, toValue, watch } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import { useRuntimeConfig } from '#imports'
import { atelierFetch } from './useAtelierAdmin'
import { useAtelierRealtime } from './useAtelierRealtime'

export interface EntryLock { userId: string, name: string, acquiredAt: string, expiresAt: string, mine: boolean }
export interface EntryViewer { userId: string, name: string, seenAt: string, me: boolean }
export interface Presence { lock: EntryLock | null, viewers: EntryViewer[], granted?: boolean }

const HEARTBEAT = 20_000

/** `target` is the entry (`id`: a singleton's name) or null for none (a new entry); `canEdit` asks for the lock. */
export function useAtelierPresence(target: MaybeRefOrGetter<{ type: string, id: string } | null>, canEdit: MaybeRefOrGetter<boolean>) {
  const client = useQueryClient()
  const realtime = useAtelierRealtime()
  const idleTimeout = ((useRuntimeConfig().public.atelier as { collaboration?: { idleTimeout?: number } } | undefined)?.collaboration?.idleTimeout ?? 900) * 1000
  const path = computed(() => {
    const t = toValue(target)
    return t ? `/collab/${encodeURIComponent(t.type)}/${encodeURIComponent(t.id)}` : ''
  })
  const queryKey = computed(() => ['atelier', 'collab', path.value])
  const query = useQuery({
    queryKey,
    queryFn: () => atelierFetch<Presence>(path.value),
    enabled: computed(() => !!path.value),
    refetchInterval: () => realtime.pollInterval(),
  })

  // activity: typing, clicking or scrolling keeps the lock
  let lastActive = Date.now()
  const active = () => (lastActive = Date.now())
  const heartbeat = async (takeover = false) => {
    if (!path.value)
      return
    const edit = toValue(canEdit) && (takeover || Date.now() - lastActive < idleTimeout)
    try {
      client.setQueryData(queryKey.value, await atelierFetch<Presence>(path.value, { method: 'POST', body: { edit, ...takeover ? { takeover } : {} } }))
    }
    catch {
      // offline or signed out: the next heartbeat tries again, and the query shows the last known state
    }
  }
  const leave = (from: string) => {
    if (from)
      void atelierFetch(from, { method: 'DELETE' }).catch(() => {})
  }

  let timer: ReturnType<typeof setInterval> | undefined
  let unfollow = () => {}
  /** Follows the entry's changes (pushed, where the connection is up) and says it's open. */
  function open() {
    unfollow()
    const t = toValue(target)
    unfollow = t
      ? realtime.follow(`entry:${t.type}:${t.id}`, (kind) => {
          if (kind === 'lock' || kind === 'presence')
            void query.refetch()
          else if (kind === 'comments')
            void client.invalidateQueries({ queryKey: ['atelier', 'comments', t.type, t.id] })
        })
      : () => {}
    void heartbeat()
  }
  watch(path, (_, before) => {
    leave(before ?? '')
    open()
  })
  // a lock that's freed: take it at once, rather than at the next heartbeat
  watch(() => query.data.value?.lock, (lock, before) => {
    if (!lock && before && !before.mine && toValue(canEdit))
      void heartbeat()
  })
  const onPageHide = () => path.value && fetch(`/api/_atelier${path.value}`, { method: 'DELETE', keepalive: true, headers: csrfHeader() })
  onMounted(() => {
    for (const event of ['keydown', 'pointerdown', 'scroll'])
      addEventListener(event, active, { capture: true, passive: true })
    addEventListener('pagehide', onPageHide)
    timer = setInterval(() => void heartbeat(), HEARTBEAT)
    open()
  })
  onBeforeUnmount(() => {
    for (const event of ['keydown', 'pointerdown', 'scroll'])
      removeEventListener(event, active, { capture: true })
    removeEventListener('pagehide', onPageHide)
    clearInterval(timer)
    unfollow()
    leave(path.value)
  })

  const lock = computed(() => query.data.value?.lock ?? null)
  const takingOver = ref(false)
  return {
    lock,
    /** Everyone else with the entry open. */
    others: computed(() => (query.data.value?.viewers ?? []).filter(v => !v.me)),
    /** Someone else is editing: look, don't touch. */
    lockedByOther: computed(() => !!lock.value && !lock.value.mine),
    takingOver,
    async takeover() {
      takingOver.value = true
      await heartbeat(true).finally(() => (takingOver.value = false))
    },
  }
}

function csrfHeader(): Record<string, string> {
  const token = document.cookie.split('; ').find(c => c.startsWith('atelier-csrf='))?.slice('atelier-csrf='.length)
  return token ? { 'x-atelier-csrf': token } : {}
}
