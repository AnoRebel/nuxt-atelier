// Real-time invalidation for open admin sessions: "something changed in this topic, refetch it". The
// database stays the source of truth; a missed message costs latency only, since clients also poll.
//   topics: entry:<site>:<type>:<id> (locks, presence, comments), user:<id> (notifications, which aren't per site).
//   Clients subscribe to `entry:<type>:<id>`: the server puts their connection's site in (from its ticket).
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
export const entryTopic = (site: string, type: string, id: string) => `entry:${site}:${type}:${id}`
export const userTopic = (id: string) => `user:${id}`

// --- tickets: a signed-in admin gets one over HTTP (session and CSRF checked) and opens the socket with it

const TICKET_PURPOSE = 'nuxt-atelier:realtime-ticket'
const TICKET_TTL = 60_000

/** A ticket for `userId` on `site` (the request's), good for a minute: the connection is for that site only. */
export const issueTicket = (userId: string, site: string) => signToken(TICKET_PURPOSE, { u: userId, s: site, e: Date.now() + TICKET_TTL })

/** The user and site a ticket was issued for, when it's genuine and fresh. */
export async function verifyTicket(ticket: string | null | undefined): Promise<{ userId: string, site: string } | undefined> {
  const payload = ticket ? await verifyToken<{ u: string, s: string, e: number }>(TICKET_PURPOSE, ticket) : undefined
  return payload && payload.e > Date.now() && typeof payload.s === 'string' ? { userId: payload.u, site: payload.s } : undefined
}
