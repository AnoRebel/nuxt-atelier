// The admin's real-time connection, at /api/_atelier/ws?ticket=<ticket> (Nitro's WebSocket support, h3 v1).
// The upgrade is refused without a fresh ticket (issued over HTTP to a signed-in user, see collab.ts) or from
// another origin, so a page elsewhere can't open it with the user's cookies. Clients then send
// `{ "subscribe": "<topic>" }` for topics they may read, and get `{ topic, kind }` when something changed.
import { defineWebSocketHandler } from 'h3'
import { useAtelierAuth, useAtelierPolicy } from '../index'
import { subscribe, unsubscribe, verifyTicket } from '../collab/realtime'

const MAX_TOPICS = 50

/** Whether the user may follow `topic`: their own notifications, or an entry of a type they read. */
async function mayFollow(userId: string, topic: string): Promise<boolean> {
  const [kind, type, id] = topic.split(':')
  if (kind === 'user')
    return type === userId && id === undefined
  if (kind !== 'entry' || !type || !id)
    return false
  const user = await (await useAtelierAuth()).users.get(userId)
  return !!user && (await useAtelierPolicy()).can(user, 'read', type)
}

export default defineWebSocketHandler({
  async upgrade(request) {
    const url = new URL(request.url)
    // same origin only: a browser always sends Origin on a WebSocket handshake
    const origin = request.headers.get('origin')
    if (!origin || origin !== url.origin.replace(/^ws/, 'http'))
      return new Response('Forbidden', { status: 403 })
    const userId = await verifyTicket(url.searchParams.get('ticket'))
    if (!userId)
      return new Response('Unauthorized', { status: 401 })
    request.context.userId = userId
  },
  async message(peer, message) {
    const userId = peer.context.userId as string | undefined
    let data: { subscribe?: unknown, unsubscribe?: unknown }
    try {
      data = JSON.parse(message.text())
    }
    catch {
      return
    }
    const followed = (peer.context.topics ??= new Set<string>()) as Set<string>
    if (typeof data.unsubscribe === 'string') {
      unsubscribe(peer, data.unsubscribe)
      followed.delete(data.unsubscribe)
    }
    if (typeof data.subscribe === 'string' && userId && followed.size < MAX_TOPICS && await mayFollow(userId, data.subscribe)) {
      subscribe(data.subscribe, peer)
      followed.add(data.subscribe)
    }
  },
  close(peer) {
    unsubscribe(peer)
  },
})
