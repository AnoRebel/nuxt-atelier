// The signed-in user's notifications (mentions, replies, lock takeovers):
//   GET   /api/_atelier/notifications?unread=true&limit=50   { items, unread }
//   POST  /api/_atelier/notifications/read                   { ids? }: these, or all, marked read
import { defineEventHandler, getQuery } from 'nuxt/server'
import * as v from 'valibot'
import { publish, userTopic } from '../collab/realtime'
import { segments } from '../content-access'
import { apiError, readValid, validated } from '../errors'
import { assertMigrated, requireUser, useAtelierCollab } from '../index'

const PREFIX = '/api/_atelier/notifications'
const Query = v.object({
  unread: v.optional(v.picklist(['true', 'false'], 'unread: expected true or false')),
  limit: v.optional(v.pipe(v.string(), v.regex(/^\d+$/, 'limit: expected a whole number'), v.transform(Number), v.minValue(1, 'limit: at least 1'), v.maxValue(100, 'limit: at most 100'))),
})
const Read = v.object({ ids: v.optional(v.pipe(v.array(v.string(), 'ids: expected notification ids'), v.maxLength(100, 'ids: at most 100'))) })

export default defineEventHandler(async (event) => {
  await assertMigrated()
  const user = await requireUser(event)
  const collab = await useAtelierCollab()
  const parts = segments(event, PREFIX)
  if (!parts.length && event.req.method === 'GET') {
    const query = validated(Query, getQuery(event))
    return collab.notifications(user.id, { unread: query.unread === 'true', limit: query.limit })
  }
  if (parts.length === 1 && parts[0] === 'read' && event.req.method === 'POST') {
    const { ids } = await readValid(event, Read)
    await collab.markRead(user.id, ids)
    publish(userTopic(user.id), 'notifications') // the user's other tabs
    return { ok: true }
  }
  throw apiError(404, 'Not found')
})
