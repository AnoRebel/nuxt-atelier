// An upload to the media library, from the Worker (the body as the file)
import { assertMigrated, toHttpError, useAtelierMedia, useAtelierSite } from '#atelier/server'
import { defineEventHandler, getQuery } from 'nuxt/server'

export default defineEventHandler(async (event) => {
  await assertMigrated()
  const library = await useAtelierMedia(useAtelierSite(event))
  return library.upload({ body: event.req.body!, filename: String(getQuery(event).filename ?? 'file'), createdBy: null }).catch((error) => {
    throw toHttpError(error)
  })
})
