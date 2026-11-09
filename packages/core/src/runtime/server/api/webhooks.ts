// Outgoing webhooks, for administrators:
//   GET     /api/_atelier/webhooks                  every webhook, without its secret
//   POST    /api/_atelier/webhooks                  { url, events, types? }: returns `secret` (whsec_…), shown only this once
//   PATCH   /api/_atelier/webhooks/<id>             { url?, events?, types?, active? }
//   DELETE  /api/_atelier/webhooks/<id>
//   GET     /api/_atelier/webhooks/<id>/deliveries  its delivery attempts, newest first
import * as v from 'valibot'
import { defineEventHandler } from 'nuxt/server'
import { ADMIN_ROLE } from '../../shared/policy'
import { segments } from '../content-access'
import { apiError, readValid } from '../errors'
import { assertMigrated, audit, requireUser, useAtelierSchema, useAtelierWebhooks } from '../index'
import { allowedHosts, lookup, secretKey } from '../webhook-jobs'
import { encryptSecret, newSecret, targetProblem, WEBHOOK_EVENTS } from '../webhooks'

const url = v.pipe(v.string('url: expected a URL'), v.maxLength(2048, 'url: at most 2048 characters'))
const events = v.pipe(v.array(v.picklist(WEBHOOK_EVENTS, `events: expected some of ${WEBHOOK_EVENTS.join(', ')}`)), v.minLength(1, 'events: pick at least one'))
const types = v.nullable(v.array(v.pipe(v.string(), v.maxLength(64))))
const NewWebhook = v.object({ url, events, types: v.optional(types) })
const Changes = v.object({ url: v.optional(url), events: v.optional(events), types: v.optional(types), active: v.optional(v.boolean('active: expected true or false')) })

export default defineEventHandler(async (event) => {
  await assertMigrated()
  const user = await requireUser(event)
  if (user.role !== ADMIN_ROLE)
    throw apiError(403, 'Only administrators manage webhooks')
  const webhooks = await useAtelierWebhooks()
  const [id, sub, ...rest] = segments(event, '/api/_atelier/webhooks')
  const method = event.req.method

  // checked on save as well as before every delivery: a refused target gets a clear answer here
  const check = async (body: { url?: string, types?: string[] | null }) => {
    const errors: { path: string, message: string }[] = []
    const problem = body.url === undefined ? undefined : await targetProblem(body.url, allowedHosts(), await lookup())
    if (problem)
      errors.push({ path: 'url', message: problem })
    const schema = await useAtelierSchema()
    for (const [i, type] of (body.types ?? []).entries()) {
      if (!(type in schema.collections) && !(type in schema.singletons))
        errors.push({ path: `types.${i}`, message: `No collection or singleton "${type}"` })
    }
    if (errors.length)
      throw apiError(422, errors.map(e => e.message).join('; '), { errors })
  }

  if (!id && method === 'GET')
    return webhooks.list()
  if (!id && method === 'POST') {
    const body = await readValid(event, NewWebhook)
    await check(body)
    const secret = newSecret()
    const created = await webhooks.create({ url: body.url, events: body.events, types: body.types?.length ? body.types : null, encryptedSecret: await encryptSecret(secret, await secretKey()), createdBy: user.id })
    await audit(event, { action: 'webhook.created', actorId: user.id, target: { type: 'webhook', id: created.id }, details: { url: created.url, events: created.events, types: created.types } })
    return { ...created, secret }
  }
  const existing = id ? await webhooks.get(id) : undefined
  if (!existing || rest.length)
    throw apiError(404, `No webhook "${id}"`)
  if (!sub && method === 'PATCH') {
    const changes = await readValid(event, Changes)
    await check(changes)
    const updated = await webhooks.update(existing.id, { ...changes, ...changes.types ? { types: changes.types.length ? changes.types : null } : {} })
    await audit(event, { action: 'webhook.updated', actorId: user.id, target: { type: 'webhook', id: existing.id }, details: { from: existing, to: updated } })
    return updated
  }
  if (!sub && method === 'DELETE') {
    await webhooks.remove(existing.id)
    await audit(event, { action: 'webhook.deleted', actorId: user.id, target: { type: 'webhook', id: existing.id }, details: { url: existing.url } })
    return { ok: true }
  }
  if (sub === 'deliveries' && method === 'GET')
    return webhooks.deliveries(existing.id)
  throw apiError(405, `${method} isn't allowed here`)
})
