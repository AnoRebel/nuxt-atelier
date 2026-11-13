// Site routing:
//   GET  /api/_atelier/routes?path=/about&locale=et&depth&draft&preview   the entry served at a path, with how to render it
// Under the content API's permissions: the caller must be able to read the entry. Published URLs and
// entries, unless `draft=true` comes from someone who can edit the type (then a draft's URL works too), or
// `preview` is a shared preview link's token for the entry at that path: its draft, for anyone, until it
// expires (410 after).
import * as v from 'valibot'
import { defineEventHandler, getQuery, useRuntimeConfig } from 'nuxt/server'
import { apiError, validated } from '../errors'
import { toHttpError, useAtelierEntries, useAtelierSchema, useAtelierSite } from '../index'
import type { PreviewToken } from '../secrets'
import { PUBLIC_ROLE } from '../../shared/policy'
import { cached, remember } from '../cache'
import { allow, caller, limits, mediaOf, present, stageFor } from '../content-access'
import { PREVIEW_PURPOSE, verifyToken } from '../secrets'
import { canonicalPath } from '../routes'

const Query = v.object({
  path: v.string('path: expected a site path like /about'),
  locale: v.optional(v.string()),
  depth: v.optional(v.pipe(v.string(), v.regex(/^\d+$/, 'depth: expected a whole number'), v.transform(Number))),
  draft: v.optional(v.string()),
  preview: v.optional(v.string()),
})

export default defineEventHandler(async (event) => {
  if (event.req.method !== 'GET')
    throw apiError(405, `${event.req.method} isn't allowed here`)
  const query = validated(Query, getQuery(event))
  const schema = await useAtelierSchema()
  const notFound = () => apiError(404, `Nothing is served at ${JSON.stringify(query.path)}`)
  // an app without routable types serves nothing here: its own 404, without a database
  if (!Object.values({ ...schema.collections, ...schema.singletons }).some(d => d.route))
    throw notFound()
  const who = await caller(event, true) // first: whether a path exists isn't told to anyone who can't read it
  const entries = await useAtelierEntries(useAtelierSite(event))
  // what visitors see is cached until content changes; anything else is private to who asked
  const shared = who.principal.role === PUBLIC_ROLE && query.draft === undefined && query.preview === undefined
  if (!shared)
    event.res.headers.set('cache-control', 'private, no-store')
  try {
    const path = canonicalPath(query.path)
    const key = `route:${who.site.name}|${path}|${query.locale ?? ''}|${query.depth ?? 0}`
    const hit = shared ? cached<object>(key) : undefined
    if (hit)
      return hit
    // a shared preview link: valid only for the entry it names, at that entry's draft URL
    const link = query.preview === undefined ? undefined : await verifyToken<PreviewToken>(PREVIEW_PURPOSE, query.preview)
    if (link && link.e < Date.now())
      throw apiError(410, 'This preview link has expired. Ask for a new one.')
    // drafts for whoever may preview them: the draft's own URL first, then the published one
    const draftRoute = path === undefined || (query.draft === undefined && !link) ? undefined : await entries.resolve(path, query.locale, 'draft')
    const linked = !!link && !!draftRoute && draftRoute.name === link.t && draftRoute.id === link.i
    const drafting = !!draftRoute && (linked || stageFor(who, draftRoute.name, query.draft) === 'draft')
    const route = drafting ? draftRoute : path === undefined ? undefined : await entries.resolve(path, query.locale)
    if (!route)
      throw notFound()
    const stage = drafting ? 'draft' : 'published'
    const definition = route.kind === 'singleton' ? schema.singletons[route.name]! : schema.collections[route.name]!
    const depth = Math.min(query.depth ?? 0, limits().maxRelationDepth)
    const entry = route.kind === 'singleton'
      ? await entries.getSingleton(route.name, { depth, stage })
      // a localized entry's page fills its empty translated fields from the fallback locales
      : await entries.get(route.name, route.id, { depth, stage, locale: (definition as { localized?: unknown }).localized ? route.locale : undefined })
    if (!entry)
      throw notFound()
    if (!linked) // the link's signer could edit the entry, and shared it
      allow(who, 'read', route.name, route.kind === 'singleton' ? undefined : entry as { createdBy: string | null })
    const { component, layout } = definition.route!
    const data = await present(who, definition.fields, route.name, entry.data)
    const media = await mediaOf(who, definition.fields, data)
    // a localized entry's URL in each locale it's published in (drafts: has a draft in), for hreflang links
    const translations = (entry as { translations?: Record<string, string> }).translations
    const alternates: Record<string, string> = {}
    for (const [locale, id] of Object.entries(translations ?? {})) {
      const path = id === route.id ? route.path : (await entries.get(route.name, id, { stage }))?.path
      if (path)
        alternates[locale] = path
    }
    // structured data from the type's route.jsonLd, run here: it's code, and may read any field
    const siteUrl = (useRuntimeConfig().public as { atelier?: { siteUrl?: string } }).atelier?.siteUrl?.replace(/\/$/, '') ?? ''
    const jsonLd = definition.route!.jsonLd?.({ data, url: `${siteUrl}${route.path}`, createdAt: (entry as { createdAt?: string }).createdAt, updatedAt: entry.updatedAt })
    const answer = {
      ...route,
      component: component ?? null,
      layout: layout ?? null,
      // rendered in this order when there's no component
      blocks: Object.entries(definition.fields).filter(([, f]) => f.type === 'blocks').map(([key]) => key),
      entry: { ...entry, path: route.path, data },
      ...Object.keys(media).length ? { media } : {},
      ...Object.keys(alternates).length > 1 ? { alternates } : {},
      ...jsonLd ? { jsonLd } : {},
    }
    if (shared && path !== undefined)
      remember(key, answer)
    return answer
  }
  catch (error) {
    throw toHttpError(error)
  }
})
