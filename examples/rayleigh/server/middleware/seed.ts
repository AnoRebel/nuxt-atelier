// The demo content (seed/content.json and its images), put into an empty database by the first request.
// Skipped once the settings exist (saved last): delete the database (.data/) to start again. A seed cut
// short resumes where it stopped, without duplicates. Remove this file, and
// seed/, when you make the site your own.
import { assertMigrated, singleSite, useAtelierEntries, useAtelierMedia, useAtelierSchema } from '#atelier/server'

interface Seed {
  media: Record<string, { file: string, width: number, height: number, alt: string }>
  home: Record<string, unknown>
  forms: Record<string, Record<string, unknown>>
  pages: Record<string, unknown>[]
  posts: Record<string, unknown>[]
  settings: Record<string, unknown>
}

let seeding: Promise<void> | undefined

async function seed() {
  await assertMigrated()
  const entries = await useAtelierEntries(singleSite)
  if (await entries.getSingleton('settings'))
    return
  const content = await useStorage('assets:seed').getItem<Seed>('content.json')
  if (!content)
    return
  const library = await useAtelierMedia(singleSite)
  const locale = (await useAtelierSchema()).locales.default
  const ids: Record<string, string> = {}
  const uploaded = new Map((await library.list({ filter: { folder: { eq: 'rayleigh' } }, limit: 100 })).items.map(item => [item.filename, item.id]))
  for (const [key, { file, width, height, alt }] of Object.entries(content.media)) {
    if (uploaded.has(file)) {
      ids[key] = uploaded.get(file)!
      continue
    }
    const bytes = await useStorage('assets:seed').getItemRaw<Uint8Array>(`media/${file}`)
    const item = await library.upload({ body: new Response(bytes).body!, filename: file, folder: 'rayleigh', createdBy: null })
    await library.setDimensions(item.id, { width, height })
    await library.update(item.id, { alt: { [locale]: alt } })
    ids[key] = item.id
  }
  // the forms pages place (`form:<key>` in the content)
  const forms: Record<string, string> = {}
  const savedForms = new Map((await entries.list('atelier-forms', { stage: 'draft', limit: 100 })).items.map(entry => [entry.data.title, entry.id]))
  for (const [key, data] of Object.entries(content.forms))
    forms[key] = savedForms.get(data.title as string) ?? (await entries.save('atelier-forms', { data, publish: true })).id
  // `media:<key>` and `form:<key>` in the content: the uploaded item's and the saved form's ids
  const withMedia = <T>(value: T): T => JSON.parse(JSON.stringify(value), (_, v) =>
    typeof v === 'string' && v.startsWith('media:') ? ids[v.slice(6)] ?? null : typeof v === 'string' && v.startsWith('form:') ? forms[v.slice(5)] ?? null : v)
  for (const [type, list] of [['pages', content.pages], ['posts', content.posts]] as const) {
    const saved = new Set((await entries.list(type, { stage: 'draft', limit: 100 })).items.map(entry => entry.data.slug))
    for (const data of list.filter(d => !saved.has(d.slug)))
      await entries.save(type, { data: withMedia(data), publish: true })
  }
  if (!await entries.getSingleton('home'))
    await entries.saveSingleton('home', { data: withMedia(content.home), publish: true })
  await entries.saveSingleton('settings', { data: content.settings, publish: true })
}

export default defineEventHandler(async () => {
  seeding ??= seed().catch((error) => {
    seeding = undefined // try again with the next request
    console.error('[rayleigh] Seeding the demo content failed:', error)
  })
  await seeding
})
