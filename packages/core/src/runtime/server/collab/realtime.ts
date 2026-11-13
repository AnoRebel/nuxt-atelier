// Real-time invalidation for open admin sessions: "something changed in this topic, refetch it". The
// database stays the source of truth; a missed message costs latency only, since clients also poll.
//   topics: entry:<type>:<id> (locks, presence, comments), user:<id> (notifications)
// Per server instance: on several, a client hears about another instance's changes when it polls.
import { signToken, verifyToken } from '../secrets'

export interface RealtimePeer { send: (message: string) => void }
export type RealtimeKind = 'lock' | 'presence' | 'comments' | 'notifications'

const topics = new Map<string, Set<RealtimePeer>>()

export function subscribe(topic: string, peer: RealtimePeer): void {
  const set = topics.get(topic) ?? topics.set(topic, new Set()).get(topic)!
  set.add(peer)
}
export function unsubscribe(peer: RealtimePeer, topic?: string): void {
  for (const [name, set] of topics) {
    if (topic && name !== topic)
      continue
    set.delete(peer)
    if (!set.size)
      topics.delete(name)
  }
}
/** Tells the topic's subscribers what changed. Never throws. */
export function publish(topic: string, kind: RealtimeKind): void {
  const message = JSON.stringify({ topic, kind })
  for (const peer of topics.get(topic) ?? []) {
    try {
      peer.send(message)
    }
    catch {
      unsubscribe(peer) // a closed connection
    }
  }
}
export const entryTopic = (type: string, id: string) => `entry:${type}:${id}`
export const userTopic = (id: string) => `user:${id}`

// --- tickets: a signed-in admin gets one over HTTP (session and CSRF checked) and opens the socket with it

const TICKET_PURPOSE = 'nuxt-atelier:realtime-ticket'
const TICKET_TTL = 60_000

/** A ticket for `userId`, good for a minute. */
export const issueTicket = (userId: string) => signToken(TICKET_PURPOSE, { u: userId, e: Date.now() + TICKET_TTL })

/** The user a ticket was issued to, when it's genuine and fresh. */
export async function verifyTicket(ticket: string | null | undefined): Promise<string | undefined> {
  const payload = ticket ? await verifyToken<{ u: string, e: number }>(TICKET_PURPOSE, ticket) : undefined
  return payload && payload.e > Date.now() ? payload.u : undefined
}
