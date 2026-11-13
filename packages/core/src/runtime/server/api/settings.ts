// Site settings, for roles with the `settings` capability:
//   GET     /api/_atelier/settings/<key>   { value, source: 'database' | 'config', config }
//   PUT     /api/_atelier/settings/<key>   { value }: overrides the module option
//   DELETE  /api/_atelier/settings/<key>   back to the module option
// Keys: robots (robots.txt rules).
import { defineEventHandler, getRequestURL } from 'nuxt/server'
import { forgetCached } from '../cache'
import { apiError, readJson } from '../errors'
import { assertMigrated, audit, requireUser, useAtelierSettings } from '../index'
import { isSettingKey } from '../settings'

const PREFIX = '/api/_atelier/settings/'

export default defineEventHandler(async (event) => {
  await assertMigrated()
  const actor = await requireUser(event, 'settings')
  const key = decodeURIComponent(getRequestURL(event).pathname.slice(PREFIX.length).replace(/\/$/, ''))
  if (!isSettingKey(key))
    throw apiError(404, `No setting "${key}"`)
  const settings = await useAtelierSettings()
  const method = event.req.method
  if (method === 'GET')
    return settings.get(key)
  const before = (await settings.get(key)).value
  if (method === 'PUT') {
    const body = await readJson(event) as { value?: unknown } | undefined
    await settings.set(key, body?.value, actor.id)
  }
  else if (method === 'DELETE') {
    await settings.reset(key)
  }
  else {
    throw apiError(405, 'Method not allowed')
  }
  forgetCached()
  const after = await settings.get(key)
  await audit(event, { action: 'settings.changed', actorId: actor.id, target: { type: 'setting', id: key }, details: { from: before, to: after.value, source: after.source } })
  return after
})
