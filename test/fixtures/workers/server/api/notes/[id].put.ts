import { assertMigrated, toHttpError, useAtelierEntries } from '#atelier/server'
import { defineEventHandler, getRouterParam, readBody } from 'nuxt/server'

export default defineEventHandler(async (event) => {
  await assertMigrated()
  const { version, data } = await readBody<{ version: number, data: Record<string, unknown> }>(event)
  const store = await useAtelierEntries()
  return store.save('notes', { id: getRouterParam(event, 'id'), version, data }).catch((error) => {
    throw toHttpError(error)
  })
})
