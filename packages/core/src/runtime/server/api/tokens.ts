// API tokens, for administrators:
//   GET     /api/_atelier/tokens         every token, without its secret
//   POST    /api/_atelier/tokens         { name, permissions?, expiresAt? }: returns `token`, shown only this once.
//                                        Without permissions, the token is read-only.
//   DELETE  /api/_atelier/tokens/<id>    revokes it
import * as v from 'valibot'
import { defineEventHandler } from 'nuxt/server'
import { ADMIN_ROLE } from '../../shared/policy'
import { ContentPermissionsSchema } from '../auth/roles'
import { READ_ONLY } from '../auth/tokens'
import { segments } from '../content-access'
import { apiError, readValid } from '../errors'
import { assertMigrated, audit, requireUser, useAtelierTokens, useAtelierSite } from '../index'

const NewToken = v.object({
  name: v.pipe(v.string(), v.trim(), v.nonEmpty('Name the token'), v.maxLength(255)),
  permissions: v.optional(ContentPermissionsSchema),
  expiresAt: v.optional(v.nullable(v.pipe(v.string(), v.isoTimestamp('expiresAt: expected an ISO 8601 date and time')))),
})

export default defineEventHandler(async (event) => {
  await assertMigrated()
  const user = await requireUser(event)
  if (user.role !== ADMIN_ROLE)
    throw apiError(403, 'Only administrators manage API tokens')
  const tokens = await useAtelierTokens(useAtelierSite(event))
  const [id, ...rest] = segments(event, '/api/_atelier/tokens')
  const method = event.req.method

  if (!id && method === 'GET')
    return tokens.list()
  if (!id && method === 'POST') {
    const body = await readValid(event, NewToken)
    if (body.expiresAt && Date.parse(body.expiresAt) <= Date.now())
      throw apiError(422, 'expiresAt is in the past', { errors: [{ path: 'expiresAt', message: 'in the past' }] })
    const created = await tokens.create({ name: body.name, permissions: body.permissions ?? READ_ONLY, expiresAt: body.expiresAt, createdBy: user.id })
    await audit(event, { action: 'token.created', actorId: user.id, target: { type: 'token', id: created.id }, details: { name: created.name, permissions: created.permissions, expiresAt: created.expiresAt } })
    return created
  }
  if (id && !rest.length && method === 'DELETE') {
    const revoked = await tokens.revoke(id)
    if (!revoked)
      throw apiError(404, `No live token "${id}"`)
    await audit(event, { action: 'token.revoked', actorId: user.id, target: { type: 'token', id }, details: { name: revoked.name } })
    return { ok: true }
  }
  throw apiError(405, `${method} isn't allowed here`)
})
