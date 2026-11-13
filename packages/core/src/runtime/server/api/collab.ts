// Edit locks and presence, for signed-in users (the admin's entry editor):
//   GET     /api/_atelier/collab/<type>/<id>   { lock, viewers }
//   POST    /api/_atelier/collab/<type>/<id>   { edit?, takeover? }: a heartbeat, every 20 s while the entry is open;
//           `edit` takes or renews the lock (refused while someone else holds it), `takeover` takes it from them
//   DELETE  /api/_atelier/collab/<type>/<id>   closed: leaves, and gives the lock up
//   GET     /api/_atelier/collab/<type>/<id>/people   [{ id, name }]: who may read it, to mention in a comment
//   POST    /api/_atelier/collab/ticket        { ticket }: opens the real-time connection (routes/ws.ts) within a minute
// A singleton's <id> is its name. Taking over needs the publish permission on the type.
import type { AuthUser } from '../auth/adapter'
import type { Lock } from '../collab/store'
import { defineEventHandler } from 'nuxt/server'
import * as v from 'valibot'
import { entryTopic, issueTicket, publish } from '../collab/realtime'
import { notifyUser } from '../collab/notify'
import { segments } from '../content-access'
import { apiError, readValid } from '../errors'
import type { SiteContext } from '../sites'
import { siteScoped } from '../db/tables'
import { assertMigrated, requireUser, useAtelierAuth, useAtelierCollab, useAtelierEntries, useAtelierPolicy, useAtelierSchema, useAtelierSite } from '../index'

const PREFIX = '/api/_atelier/collab/'
const Heartbeat = v.object({ edit: v.optional(v.boolean('edit: expected true or false')), takeover: v.optional(v.boolean('takeover: expected true or false')) })

/** A user id with the name to show for it. */
async function named(ids: string[]): Promise<Map<string, string>> {
  const users = (await useAtelierAuth()).users
  const found = await Promise.all([...new Set(ids)].map(async id => [id, await users.get(id).catch(() => null)] as const))
  return new Map(found.map(([id, user]) => [id, user?.name || user?.email || id]))
}

/** The entry or singleton, when it exists and the user may read it: 404 otherwise, so nothing leaks. */
export async function readableType(site: SiteContext, user: AuthUser, type: string | undefined, id: string | undefined): Promise<{ type: string, id: string, topic: string }> {
  const schema = await useAtelierSchema()
  const policy = await useAtelierPolicy()
  // a site's own singleton keeps its locks and comments under `name@site`; topics stay on the name
  if (type && id && schema.singletons[type] && id === type && policy.can(user, 'read', type))
    return { type, id: siteScoped(schema, schema.singletons[type]) ? `${id}@${site.name}` : id, topic: entryTopic(site.name, type, id) }
  const entry = type && id && schema.collections[type] ? await (await useAtelierEntries(site)).get(type, id, { stage: 'draft' }) : undefined
  if (!entry || !policy.can(user, 'read', type!, entry))
    throw apiError(404, 'Not found')
  return { type: type!, id: id!, topic: entryTopic(site.name, type!, id!) }
}

export default defineEventHandler(async (event) => {
  await assertMigrated()
  const user = await requireUser(event)
  const method = event.req.method
  const parts = segments(event, PREFIX)
  if (parts.length === 1 && parts[0] === 'ticket' && method === 'POST')
    return { ticket: await issueTicket(user.id, useAtelierSite(event).name) }
  if (parts.length !== 2 && !(parts.length === 3 && parts[2] === 'people' && method === 'GET'))
    throw apiError(404, 'Not found')
  const { type, id, topic } = await readableType(useAtelierSite(event), user, parts[0], parts[1])
  if (parts[2] === 'people') {
    const policy = await useAtelierPolicy()
    const users = await (await useAtelierAuth()).users.list()
    // ponytail: every user, filtered here; a search parameter when sites have thousands of them
    return users.filter(u => policy.can(u, 'read', type)).map(u => ({ id: u.id, name: u.name || u.email }))
  }
  const collab = await useAtelierCollab()
  const state = async (lock: Lock | null) => {
    const viewers = await collab.viewers(type, id)
    const names = await named([...viewers.map(w => w.userId), ...lock ? [lock.userId] : []])
    return {
      lock: lock && { userId: lock.userId, name: names.get(lock.userId)!, acquiredAt: lock.acquiredAt, expiresAt: lock.expiresAt, mine: lock.userId === user.id },
      viewers: viewers.map(w => ({ userId: w.userId, name: names.get(w.userId)!, seenAt: w.seenAt, me: w.userId === user.id })),
    }
  }

  if (method === 'GET')
    return state(await collab.lockOf(type, id))
  if (method === 'POST') {
    const { edit, takeover } = await readValid(event, Heartbeat)
    const policy = await useAtelierPolicy()
    if (edit && !policy.can(user, 'update', type))
      throw apiError(403, `Your role can't update "${type}"`)
    if (takeover && !policy.can(user, 'publish', type))
      throw apiError(403, `Your role can't take over edits in "${type}"`)
    const before = await collab.lockOf(type, id)
    const firstVisit = !(await collab.viewers(type, id)).some(w => w.userId === user.id)
    await collab.touch(type, id, user.id)
    let lock = before
    let granted = false
    if (edit || takeover) {
      const result = await collab.acquire(type, id, user.id, !!takeover)
      lock = result.lock
      granted = result.granted
      if (result.takenFrom)
        await notifyUser(event, result.takenFrom, 'takeover', { type, entry: id, by: user.id })
    }
    if (firstVisit)
      publish(topic, 'presence')
    if (lock?.userId !== before?.userId)
      publish(topic, 'lock')
    return { ...await state(lock), granted }
  }
  if (method === 'DELETE') {
    await collab.leave(type, id, user.id)
    publish(topic, 'presence')
    if (await collab.release(type, id, user.id))
      publish(topic, 'lock')
    return { ok: true }
  }
  throw apiError(405, 'Method not allowed')
})
