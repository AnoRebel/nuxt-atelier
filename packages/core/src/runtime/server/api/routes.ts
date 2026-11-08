// Site routing:
//   GET  /api/_atelier/routes?path=/about&locale=et&depth   the entry served at a path, with how to render it
// Under the content API's permissions: the caller must be able to read the entry.
import * as v from 'valibot'
import { defineEventHandler, getQuery } from 'nuxt/server'
import { apiError, validated } from '../errors'
import { toHttpError, useAtelierEntries, useAtelierSchema } from '../index'
import { allow, caller, limits, present } from '../content-access'
import { canonicalPath } from '../routes'

const Query = v.object({
  path: v.string('path: expected a site path like /about'),
  locale: v.optional(v.string()),
  depth: v.optional(v.pipe(v.string(), v.regex(/^\d+$/, 'depth: expected a whole number'), v.transform(Number))),
})

export default defineEventHandler(async (event) => {
  if (event.req.method !== 'GET')
    throw apiError(405, `${event.req.method} isn't allowed here`)
  const query = validated(Query, getQuery(event))
  const who = await caller(event) // first: whether a path exists isn't told to anyone who can't read it
  const entries = await useAtelierEntries()
  const schema = await useAtelierSchema()
  const notFound = () => apiError(404, `Nothing is served at ${JSON.stringify(query.path)}`)
  try {
    const path = canonicalPath(query.path)
    const route = path === undefined ? undefined : await entries.resolve(path, query.locale)
    if (!route)
      throw notFound()
    const definition = route.kind === 'singleton' ? schema.singletons[route.name]! : schema.collections[route.name]!
    const depth = Math.min(query.depth ?? 0, limits().maxRelationDepth)
    const entry = route.kind === 'singleton'
      ? await entries.getSingleton(route.name, { depth })
      : await entries.get(route.name, route.id, { depth })
    if (!entry)
      throw notFound()
    allow(who, 'read', route.name, route.kind === 'singleton' ? undefined : entry as { createdBy: string | null })
    const { component, layout } = definition.route!
    return {
      ...route,
      component: component ?? null,
      layout: layout ?? null,
      // rendered in this order when there's no component
      blocks: Object.entries(definition.fields).filter(([, f]) => f.type === 'blocks').map(([key]) => key),
      entry: { ...entry, path: route.path, data: await present(who, definition.fields, route.name, entry.data) },
    }
  }
  catch (error) {
    throw toHttpError(error)
  }
})
