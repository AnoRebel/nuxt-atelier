import { useAtelierEntries } from '#atelier/server'
import { defineEventHandler, getRouterParam } from 'nuxt/server'

export default defineEventHandler(async (event) => {
  const store = await useAtelierEntries()
  return store.get('notes', getRouterParam(event, 'id')!)
})
