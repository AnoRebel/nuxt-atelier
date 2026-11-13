// The admin's real-time connection: one WebSocket per tab, opened with a short-lived ticket, telling
// followers of a topic that something changed so they refetch. Where WebSocket isn't served
// (`collaboration.realtime`) or the connection drops, `connected` is false and followers poll every 20
// seconds instead; while connected they still poll every 60, to catch changes made on other server instances.
import { ref } from 'vue'
import { useRuntimeConfig } from '#imports'
import { atelierFetch } from './useAtelierAdmin'

type Listener = (kind: string) => void

const connected = ref(false)
const listeners = new Map<string, Set<Listener>>()
let socket: WebSocket | undefined
let retry: ReturnType<typeof setTimeout> | undefined
let failures = 0

const send = (message: Record<string, string>) => socket?.readyState === WebSocket.OPEN && socket.send(JSON.stringify(message))

async function connect() {
  if (socket || retry || !listeners.size)
    return
  try {
    const { ticket } = await atelierFetch<{ ticket: string }>('/collab/ticket', { method: 'POST' })
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
    socket = new WebSocket(`${scheme}://${location.host}/api/_atelier/ws?ticket=${encodeURIComponent(ticket)}`)
  }
  catch {
    return reconnect()
  }
  socket.addEventListener('open', () => {
    connected.value = true
    failures = 0
    for (const topic of listeners.keys())
      send({ subscribe: topic })
  })
  socket.addEventListener('message', (event) => {
    try {
      const { topic, kind } = JSON.parse(String(event.data)) as { topic: string, kind: string }
      listeners.get(topic)?.forEach(listener => listener(kind))
    }
    catch {
      // not a message of ours
    }
  })
  socket.addEventListener('close', () => {
    socket = undefined
    connected.value = false
    reconnect()
  })
}

/** Tries again later, backing off to a minute; polling covers the gap. */
function reconnect() {
  if (retry || !listeners.size)
    return
  failures++
  retry = setTimeout(() => {
    retry = undefined
    void connect()
  }, Math.min(60_000, 2_000 * 2 ** Math.min(failures, 5)))
}

export function useAtelierRealtime() {
  const enabled = (useRuntimeConfig().public.atelier as { collaboration?: { realtime?: boolean } } | undefined)?.collaboration?.realtime ?? false
  return {
    /** True while changes are pushed; poll more often when false. */
    connected,
    /** How often to poll: rarely while connected, every 20 seconds otherwise. */
    pollInterval: () => connected.value ? 60_000 : 20_000,
    /** Calls `listener` with what changed in `topic`; returns the unfollow. */
    follow(topic: string, listener: Listener): () => void {
      if (!enabled || typeof WebSocket === 'undefined')
        return () => {}
      const set = listeners.get(topic) ?? listeners.set(topic, new Set()).get(topic)!
      set.add(listener)
      if (set.size === 1)
        send({ subscribe: topic })
      void connect()
      return () => {
        set.delete(listener)
        if (set.size)
          return
        listeners.delete(topic)
        send({ unsubscribe: topic })
      }
    },
  }
}
