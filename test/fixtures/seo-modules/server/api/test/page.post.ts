import { useAtelierEntries, useAtelierSite } from '#atelier/server'
import { defineEventHandler, readBody } from 'nuxt/server'

// Test probe: a published page
export default defineEventHandler(async event => (await useAtelierEntries(useAtelierSite(event))).save('pages', { data: await readBody(event), publish: true }))
