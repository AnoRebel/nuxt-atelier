import { defineEventHandler } from 'nuxt/server'
import { useAtelierSchema } from '#atelier/server'

// Test probe: the registered content types and their labels
export default defineEventHandler(async () => {
  const { collections, singletons } = await useAtelierSchema()
  return {
    collections: Object.fromEntries(Object.entries(collections).map(([name, c]) => [name, c.labels?.singular])),
    singletons: Object.fromEntries(Object.entries(singletons).map(([name, s]) => [name, s.label])),
  }
})
