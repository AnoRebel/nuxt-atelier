import { assertMigrated, toHttpError, useAtelierEntries } from '#atelier/server'
import { defineEventHandler, readBody } from 'nuxt/server'

export default defineEventHandler(async (event) => {
  await assertMigrated()
  const store = await useAtelierEntries()
  return store.save('notes', { data: await readBody(event) }).catch((error) => {
    throw toHttpError(error)
  })
})
