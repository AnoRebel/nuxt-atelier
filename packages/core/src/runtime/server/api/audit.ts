// The audit log, for administrators: GET ?limit=50&before=<at of the last entry>&action=user.updated
import * as v from 'valibot'
import { createError, defineEventHandler, getValidatedQuery } from 'nuxt/server'
import { ADMIN_ROLE } from '../../shared/policy'
import { assertMigrated, requireUser, useAtelierAudit } from '../index'

const Query = v.object({
  limit: v.optional(v.pipe(v.string(), v.transform(Number), v.integer(), v.minValue(1), v.maxValue(200))),
  before: v.optional(v.pipe(v.string(), v.isoTimestamp())),
  action: v.optional(v.pipe(v.string(), v.maxLength(64))),
})

export default defineEventHandler(async (event) => {
  await assertMigrated()
  const user = await requireUser(event)
  if (user.role !== ADMIN_ROLE)
    throw createError({ status: 403, message: 'Only administrators can read the audit log' })
  return (await useAtelierAudit()).list(await getValidatedQuery(event, Query))
})
