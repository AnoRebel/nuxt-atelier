// The admin's real-time connection, at /api/_atelier/ws?ticket=<ticket> (Nitro's WebSocket support, h3 v1).
// The upgrade is refused without a fresh ticket (issued over HTTP to a signed-in user, see collab.ts) or from
// another origin, so a page elsewhere can't open it with the user's cookies. Clients then send
// `{ "subscribe": "<topic>" }` for topics they may read (entries of the ticket's site), and get `{ topic, kind }`
// when something changed.
import type { SitesConfig } from '../sites'
import { defineWebSocketHandler } from 'h3'
import { ADMIN_ROLE } from '../../shared/policy'
import { readableType } from '../api/collab'
import { useAtelierAuth, useAtelierServerConfig, useAtelierSiteRoles } from '../index'
import type { RealtimePeer } from '../collab/realtime'
import { subscribe, unsubscribe, verifyTicket } from '../collab/realtime'
import { siteNamed } from '../sites'

const MAX_TOPICS = 50

/**
 * The topic a client's subscription means, when the user may follow it: their own notifications, or an
 * entry of the connection's site they may read there (`entry:<type>:<id>` becomes `entry:<site>:<type>:<id>`).
 */
async function topicFor(userId: string, siteName: string, asked: string): Promise<string | undefined> {
  const [kind, type, id, ...rest] = asked.split(':')
  if (kind === 'user')
    return type === userId && id === undefined ? asked : undefined
  if (kind !== 'entry' || !type || !id || rest.length)
    return undefined
  const site = siteNamed((useAtelierServerConfig() as unknown as { sites: SitesConfig }).sites, siteName)
  const signedIn = site && await (await useAtelierAuth()).users.get(userId)
  if (!site || !signedIn)
    return undefined
  // the user as they are on that site: their role there (administrators keep theirs)
  const role = !site.scoped || signedIn.role === ADMIN_ROLE ? signedIn.role : await (await useAtelierSiteRoles()).roleOn(userId, site.name)
  if (!role)
    return undefined
  return readableType(site, { ...signedIn, role }, type, id).then(found => found.topic, () => undefined)
}

export default defineWebSocketHandler({
  async upgrade(request) {
    const url = new URL(request.url)
    // same origin only: a browser always sends Origin on a WebSocket handshake
    const origin = request.headers.get('origin')
    if (!origin || origin !== url.origin.replace(/^ws/, 'http'))
      return new Response('Forbidden', { status: 403 })
    const ticket = await verifyTicket(url.searchParams.get('ticket'))
    if (!ticket)
      return new Response('Unauthorized', { status: 401 })
    request.context.userId = ticket.userId
    request.context.site = ticket.site
  },
  async message(peer, message) {
    const userId = peer.context.userId as string | undefined
    const site = peer.context.site as string | undefined
    let data: { subscribe?: unknown, unsubscribe?: unknown }
    try {
      data = JSON.parse(message.text())
    }
    catch {
      return
    }
    // what the client asked for, and its listener on the topic that means on the connection's site, which
    // reports changes under the name the client knows
    const followed = (peer.context.topics ??= new Map<string, RealtimePeer>()) as Map<string, RealtimePeer>
    if (typeof data.unsubscribe === 'string' && followed.has(data.unsubscribe)) {
      unsubscribe(followed.get(data.unsubscribe)!)
      followed.delete(data.unsubscribe)
    }
    if (typeof data.subscribe === 'string' && userId && site && followed.size < MAX_TOPICS && !followed.has(data.subscribe)) {
      const asked = data.subscribe
      const topic = await topicFor(userId, site, asked)
      if (topic) {
        const listener: RealtimePeer = { send: change => peer.send(JSON.stringify({ ...JSON.parse(change), topic: asked })) }
        subscribe(topic, listener)
        followed.set(asked, listener)
      }
    }
  },
  close(peer) {
    for (const listener of ((peer.context.topics as Map<string, RealtimePeer> | undefined) ?? new Map()).values())
      unsubscribe(listener)
  },
})
