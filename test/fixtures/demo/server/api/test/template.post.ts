// The template's content, written as the app does (not through the API, which takes no changes outside a demo)
import { assertMigrated, singleSite, useAtelierEntries } from '#atelier/server'

export default defineEventHandler(async () => {
  await assertMigrated() // the tables exist: the server applies migrations as it starts
  const entries = await useAtelierEntries(singleSite)
  return entries.save('pages', { data: { title: 'Template title', slug: 'welcome' }, publish: true })
})
