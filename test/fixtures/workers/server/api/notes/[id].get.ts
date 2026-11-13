import { useAtelierEntries, useAtelierSite } from '#atelier/server'
import { defineEventHandler, getRouterParam } from 'nuxt/server'

export default defineEventHandler(async (event) => {
  const store = await useAtelierEntries(useAtelierSite(event))
  return store.get('notes', getRouterParam(event, 'id')!)
})
