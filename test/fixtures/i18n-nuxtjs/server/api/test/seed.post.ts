import { useAtelierEntries } from '#atelier/server'
import { defineEventHandler } from 'nuxt/server'

// Test probe: an English product with its German translation, and a page every locale shares
export default defineEventHandler(async () => {
  const entries = await useAtelierEntries()
  const chair = await entries.save('products', { data: { slug: 'chair', title: 'Chair', subtitle: 'Sit down' } })
  await entries.save('products', { data: { slug: 'stuhl', title: 'Stuhl' }, locale: 'de', translationOf: chair.id })
  await entries.save('pages', { data: { slug: 'about', title: 'About us' } })
  return { ok: true }
})
