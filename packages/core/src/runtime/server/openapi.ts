// The content API as an OpenAPI 3.1 document, generated from the content schema: one set of paths per
// collection and singleton, with JSON Schemas of their fields.
import type { Field, Fields } from '../shared/fields'
import type { ContentSchema } from './db/tables'
import type { RouteDefinition } from './types'
import { UNIQUE_MAX_LENGTH } from '../shared/fields'

type JsonSchema = Record<string, unknown>
const BASE = '/api/_atelier'

const values = (options: readonly (string | { value: string })[]) => options.map(o => typeof o === 'string' ? o : o.value)
const pascal = (name: string) => name.replace(/(?:^|-)([a-z0-9])/g, (_, c: string) => c.toUpperCase())
const length = (f: { minLength?: number, maxLength?: number }) => ({
  ...f.minLength === undefined ? {} : { minLength: f.minLength },
  ...f.maxLength === undefined ? {} : { maxLength: f.maxLength },
})
const items = (f: { minItems?: number, maxItems?: number }) => ({
  ...f.minItems === undefined ? {} : { minItems: f.minItems },
  ...f.maxItems === undefined ? {} : { maxItems: f.maxItems },
})

/** The JSON Schema of one field's value. Relations are ids, or entries when populated. */
function fieldSchema(field: Field): JsonSchema {
  const described = { ...field.label ? { title: field.label } : {}, ...field.help ? { description: field.help } : {} }
  const capped = (f: { unique?: boolean, maxLength?: number }) => f.unique && f.maxLength === undefined ? { maxLength: UNIQUE_MAX_LENGTH } : {}
  switch (field.type) {
    case 'text': return { ...described, type: 'string', ...length(field), ...capped(field), ...field.pattern ? { pattern: `^(?:${field.pattern})$` } : {} }
    case 'textarea': return { ...described, type: 'string', ...length(field), ...capped(field) }
    case 'email': return { ...described, type: 'string', format: 'email', ...length(field), ...capped(field) }
    case 'url': return { ...described, type: 'string', format: 'uri', pattern: '^https?://', ...length(field), ...capped(field) }
    case 'slug': return { ...described, type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$', ...length(field), ...capped(field) }
    case 'color': return { ...described, type: 'string', pattern: field.alpha ? '^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$' : '^#[0-9a-fA-F]{6}$' }
    case 'richText': return { ...described, type: 'object', description: 'A ProseMirror document', properties: { type: { const: 'doc' }, content: { type: 'array', items: { type: 'object' } } }, required: ['type'] }
    case 'number': return { ...described, type: field.integer ? 'integer' : 'number', ...field.min === undefined ? {} : { minimum: field.min }, ...field.max === undefined ? {} : { maximum: field.max } }
    case 'boolean': return { ...described, type: 'boolean' }
    case 'select': return { ...described, type: 'string', enum: values(field.options) }
    case 'multiSelect': return { ...described, type: 'array', uniqueItems: true, items: { type: 'string', enum: values(field.options) }, ...items(field) }
    case 'date': return { ...described, type: 'string', format: field.mode === 'datetime' ? 'date-time' : field.mode === 'time' ? 'time' : 'date' }
    case 'json': return { ...described }
    case 'media': return { ...described, type: 'string', description: 'A media item id' }
    case 'relation': {
      const one = { oneOf: [{ type: 'string', description: `An entry id in "${field.to}"` }, { $ref: '#/components/schemas/RelatedEntry' }] }
      return field.many ? { ...described, type: 'array', items: one, ...items(field) } : { ...described, ...one }
    }
    case 'object': return { ...described, ...dataSchema(field.fields) }
    case 'repeater': return { ...described, type: 'array', items: dataSchema(field.fields), ...items(field) }
    case 'blocks': return { ...described, type: 'array', items: { $ref: '#/components/schemas/Block' }, ...items(field) }
    case 'custom': return { ...described, ...field.storage === 'json' ? {} : { type: field.storage === 'text' ? 'string' : field.storage }, 'x-atelier-field-type': field.fieldType }
  }
}

/** An object of fields; a field that isn't required may be null. */
function dataSchema(fields: Fields): JsonSchema {
  return {
    type: 'object',
    additionalProperties: false,
    properties: Object.fromEntries(Object.entries(fields).map(([key, field]) => {
      const schema = fieldSchema(field)
      return [key, field.required ? schema : { anyOf: [schema, { type: 'null' }] }]
    })),
    required: Object.entries(fields).filter(([, f]) => f.required).map(([key]) => key),
  }
}

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` })
const json = (schema: JsonSchema, description = 'OK') => ({ description, content: { 'application/json': { schema } } })
const errors = (...statuses: number[]) => Object.fromEntries(statuses.map(s => [String(s), { $ref: `#/components/responses/E${s}` }]))
const param = (name: string, description: string, schema: JsonSchema = { type: 'string' }, where = 'query') =>
  ({ name, in: where, required: where === 'path', description, schema })

export function openApiDocument(schema: ContentSchema, info: { title?: string, version?: string } = {}): JsonSchema {
  const schemas: Record<string, JsonSchema> = {
    RelatedEntry: { type: 'object', description: 'A populated relation', properties: { id: { type: 'string' }, version: { type: 'integer' }, createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' }, createdBy: { type: ['string', 'null'] }, publishedVersion: { type: ['integer', 'null'], description: 'The version the site serves, or null when unpublished; below `version` when the draft has unpublished changes' }, data: { type: 'object' } }, required: ['id', 'version', 'data'] },
    Block: { type: 'object', properties: { id: { type: 'string' }, type: { type: 'string' }, props: { type: 'object' } }, required: ['id', 'type', 'props'] },
    Revision: { type: 'object', properties: { version: { type: 'integer' }, createdAt: { type: 'string', format: 'date-time' }, authorId: { type: ['string', 'null'] }, published: { type: 'boolean', description: 'This version was published' } }, required: ['version', 'createdAt', 'authorId', 'published'] },
    Error: {
      type: 'object',
      properties: {
        statusCode: { type: 'integer' },
        message: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            code: { type: 'string', enum: ['bad_request', 'invalid_query', 'unauthenticated', 'forbidden', 'csrf', 'not_found', 'method_not_allowed', 'conflict', 'referenced', 'last_admin', 'setup_done', 'already_exists', 'validation_failed', 'rate_limited', 'unsupported', 'migrations_pending'] },
            errors: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, message: { type: 'string' } }, required: ['path', 'message'] } },
            currentVersion: { type: 'integer' },
            fields: { type: 'array', items: { type: 'string' } },
          },
          required: ['code'],
        },
      },
      required: ['statusCode', 'message', 'data'],
    },
  }
  const paths: Record<string, Record<string, unknown>> = {}
  // routable types: the entry's URL, and every locale's for per-locale patterns
  const urls = (route: RouteDefinition | undefined): JsonSchema => !route
    ? {}
    : {
        path: { type: ['string', 'null'], description: 'The entry\'s URL (in the first locale of a per-locale pattern)' },
        ...typeof route.pattern === 'string' ? {} : { paths: { type: 'object', additionalProperties: { type: 'string' }, description: 'The entry\'s URL in each locale' } },
        shadowed: { type: 'array', description: 'URLs of the entry that a page of the app serves instead (present only when there are some)', items: { type: 'object', properties: { path: { type: 'string' }, page: { type: 'string', description: 'The app page\'s route path' } }, required: ['path', 'page'] } },
      }
  const mediaMap = { media: { type: 'object', description: 'The media items its fields use, by id: url, filename, mime, width, height, title, alt, caption, credits, focal. Absent when there are none.', additionalProperties: { type: 'object' } } }
  const entry = (data: string, route?: RouteDefinition) => ({ type: 'object', properties: { id: { type: 'string' }, version: { type: 'integer' }, createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' }, createdBy: { type: ['string', 'null'] }, publishedVersion: { type: ['integer', 'null'], description: 'The version the site serves, or null when unpublished; below `version` when the draft has unpublished changes' }, ...urls(route), ...mediaMap, data: ref(data) }, required: ['id', 'version', 'createdAt', 'updatedAt', 'createdBy', 'publishedVersion', 'data'] })
  const depth = param('depth', 'Levels of relations to replace with the entries they point to')
  const fields = param('fields', 'Comma-separated fields to return')
  const draft = param('draft', '`true` for drafts instead of what the site serves (callers who can edit the type)', { enum: ['true', 'false', '1', '0'] })
  const publishBody = { required: true, content: { 'application/json': { schema: { type: 'object', properties: { version: { type: 'integer', description: 'The draft version you read' } }, required: ['version'] } } } }

  for (const [name, definition] of Object.entries(schema.collections)) {
    const type = pascal(name)
    const tag = [name]
    schemas[`${type}Data`] = dataSchema(definition.fields)
    schemas[`${type}Entry`] = entry(`${type}Data`, definition.route)
    schemas[`${type}List`] = { type: 'object', properties: { items: { type: 'array', items: ref(`${type}Entry`) }, total: { type: 'integer' }, limit: { type: 'integer' }, next: { type: ['string', 'null'] } }, required: ['items', 'total', 'limit', 'next'] }
    const publish = { publish: { type: 'boolean', description: 'Publish the saved version too' } }
    const body = (required: boolean) => ({ required: true, content: { 'application/json': { schema: { type: 'object', properties: { ...required ? {} : { version: { type: 'integer' } }, data: required ? ref(`${type}Data`) : { type: 'object' }, ...publish }, required: required ? ['data'] : ['version', 'data'] } } } })
    const id = param('id', 'The entry id', { type: 'string' }, 'path')
    paths[`${BASE}/collections/${name}`] = {
      get: {
        tags: tag,
        summary: `List ${name}`,
        parameters: [
          param('filter', 'A JSON filter: {"field":{"eq":value}}, with and/or groups and eq, ne, gt, gte, lt, lte, contains, in, null'),
          param('sort', 'Comma-separated fields, `-` first for descending'),
          fields,
          param('limit', 'Page size, at most the configured maximum', { type: 'string', pattern: '^\\d+$' }),
          param('offset', 'Entries to skip', { type: 'string', pattern: '^\\d+$' }),
          param('cursor', 'The `next` of the previous page'),
          depth,
          draft,
        ],
        responses: { 200: json(ref(`${type}List`)), ...errors(400, 401, 403) },
      },
      post: { tags: tag, summary: `Create an entry in ${name}`, requestBody: body(true), responses: { 200: json(ref(`${type}Entry`)), ...errors(401, 403, 409, 422, 429) } },
    }
    paths[`${BASE}/collections/${name}/{id}`] = {
      parameters: [id],
      get: { tags: tag, summary: 'Get an entry', parameters: [depth, fields, draft], responses: { 200: json(ref(`${type}Entry`)), ...errors(401, 403, 404) } },
      patch: { tags: tag, summary: 'Update an entry: `data` is merged into the stored data; `version` is the one you read', requestBody: body(false), responses: { 200: json(ref(`${type}Entry`)), ...errors(401, 403, 404, 409, 422, 429) } },
      delete: { tags: tag, summary: 'Delete an entry, applying its relations\' onDelete rules', responses: { 200: json({ type: 'object', properties: { ok: { const: true } } }), ...errors(401, 403, 404, 409, 429) } },
    }
    if (definition.versioned) {
      paths[`${BASE}/collections/${name}/{id}/publish`] = {
        parameters: [id],
        post: { tags: tag, summary: 'Publish the draft at the version you read', requestBody: publishBody, responses: { 200: json(ref(`${type}Entry`)), ...errors(401, 403, 404, 409, 422, 429) } },
      }
      paths[`${BASE}/collections/${name}/{id}/unpublish`] = {
        parameters: [id],
        post: { tags: tag, summary: 'Take the entry off the site; its draft stays', responses: { 200: json(ref(`${type}Entry`)), ...errors(401, 403, 404, 429) } },
      }
    }
    paths[`${BASE}/collections/${name}/{id}/revisions`] = {
      parameters: [id],
      get: { tags: tag, summary: 'The entry\'s saved versions, newest first', responses: { 200: json({ type: 'array', items: ref('Revision') }), ...errors(401, 403, 404) } },
    }
    paths[`${BASE}/collections/${name}/{id}/revisions/{version}`] = {
      parameters: [id, param('version', 'A version number', { type: 'string', pattern: '^\\d+$' }, 'path')],
      get: { tags: tag, summary: 'One saved version', responses: { 200: json({ allOf: [ref('Revision'), { type: 'object', properties: { data: ref(`${type}Data`) } }] }), ...errors(401, 403, 404) } },
    }
    paths[`${BASE}/collections/${name}/{id}/revisions/{version}/restore`] = {
      parameters: [id, param('version', 'The version to restore', { type: 'string', pattern: '^\\d+$' }, 'path')],
      post: { tags: tag, summary: 'Save that version\'s data as the next draft; `version` in the body is the draft version you read', requestBody: publishBody, responses: { 200: json(ref(`${type}Entry`)), ...errors(401, 403, 404, 409, 422, 429) } },
    }
  }

  for (const [name, definition] of Object.entries(schema.singletons)) {
    const type = pascal(name)
    const tag = [name]
    schemas[`${type}Data`] = dataSchema(definition.fields)
    schemas[`${type}Singleton`] = { type: 'object', properties: { name: { const: name }, version: { type: ['integer', 'null'] }, updatedAt: { type: ['string', 'null'] }, publishedVersion: { type: ['integer', 'null'], description: 'The version the site serves, or null when unpublished; below `version` when the draft has unpublished changes' }, ...urls(definition.route), data: ref(`${type}Data`) }, required: ['name', 'version', 'data'] }
    paths[`${BASE}/singletons/${name}`] = {
      get: { tags: tag, summary: `Get ${name} (its defaults, with version null, before its first save)`, parameters: [depth, fields, draft], responses: { 200: json(ref(`${type}Singleton`)), ...errors(401, 403) } },
      patch: { tags: tag, summary: `Save ${name}: \`data\` is merged; \`version\` is the one you read, or null for the first save`, requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { version: { type: ['integer', 'null'] }, data: { type: 'object' }, publish: { type: 'boolean', description: 'Publish the saved version too' } }, required: ['version', 'data'] } } } }, responses: { 200: json(ref(`${type}Singleton`)), ...errors(401, 403, 409, 422, 429) } },
    }
    if (definition.versioned) {
      paths[`${BASE}/singletons/${name}/publish`] = {
        post: { tags: tag, summary: 'Publish the draft at the version you read', requestBody: publishBody, responses: { 200: json(ref(`${type}Singleton`)), ...errors(401, 403, 404, 409, 422, 429) } },
      }
      paths[`${BASE}/singletons/${name}/unpublish`] = {
        post: { tags: tag, summary: 'Take it off the site; its draft stays', responses: { 200: json({ type: 'object', properties: { ok: { const: true } } }), ...errors(401, 403, 429) } },
      }
    }
    paths[`${BASE}/singletons/${name}/revisions`] = {
      get: { tags: tag, summary: 'Saved versions, newest first', responses: { 200: json({ type: 'array', items: ref('Revision') }), ...errors(401, 403) } },
    }
    paths[`${BASE}/singletons/${name}/revisions/{version}/restore`] = {
      parameters: [param('version', 'The version to restore', { type: 'string', pattern: '^\\d+$' }, 'path')],
      post: { tags: tag, summary: 'Save that version\'s data as the next draft; `version` in the body is the draft version you read', requestBody: publishBody, responses: { 200: json(ref(`${type}Singleton`)), ...errors(401, 403, 404, 409, 422, 429) } },
    }
  }

  paths[`${BASE}/routes`] = {
    get: {
      tags: ['routes'],
      summary: 'The entry served at a site path, with how its type renders it',
      parameters: [{ ...param('path', 'A site path, like /about'), required: true }, param('locale', 'The locale of a per-locale pattern'), depth, draft],
      responses: {
        200: json({
          type: 'object',
          properties: {
            path: { type: 'string', description: 'The canonical path' },
            locale: { type: 'string', description: 'The locale of the matching pattern, or "" for one shared by every locale' },
            kind: { enum: ['collection', 'singleton'] },
            name: { type: 'string', description: 'The collection or singleton' },
            id: { type: 'string', description: 'The entry id, or the singleton\'s name' },
            component: { type: ['string', 'null'] },
            layout: { type: ['string', 'null'] },
            blocks: { type: 'array', items: { type: 'string' }, description: 'The type\'s blocks fields, rendered in this order without a component' },
            entry: { type: 'object', description: 'The entry or singleton, as its own endpoint returns it' },
          },
          required: ['path', 'locale', 'kind', 'name', 'id', 'component', 'layout', 'blocks', 'entry'],
        }),
        ...errors(401, 403, 404),
      },
    },
  }

  schemas.Redirect = {
    type: 'object',
    properties: {
      id: { type: 'string' },
      source: { type: 'string', description: 'A path, or a pattern with :name segments and a final *' },
      target: { type: 'string', description: 'A path on the site or an absolute http(s) URL; may use the source\'s :names and *' },
      status: { enum: [301, 302, 307, 308] },
      auto: { type: 'boolean', description: 'Created when an entry\'s URL changed' },
    },
    required: ['id', 'source', 'target', 'status', 'auto'],
  }
  const redirectBody = { required: true, content: { 'application/json': { schema: { type: 'object', properties: { source: { type: 'string' }, target: { type: 'string' }, status: { enum: [301, 302, 307, 308] } }, required: ['source', 'target'] } } } }
  paths[`${BASE}/redirects`] = {
    get: { tags: ['redirects'], summary: 'Every redirect, oldest first (`redirects` capability)', responses: { 200: json({ type: 'array', items: ref('Redirect') }), ...errors(401, 403) } },
    post: { tags: ['redirects'], summary: 'Create a redirect; loops are refused', requestBody: redirectBody, responses: { 200: json(ref('Redirect')), ...errors(401, 403, 422) } },
  }
  paths[`${BASE}/redirects/{id}`] = {
    parameters: [param('id', 'The redirect id', { type: 'string' }, 'path')],
    patch: { tags: ['redirects'], summary: 'Update a redirect', requestBody: redirectBody, responses: { 200: json(ref('Redirect')), ...errors(401, 403, 404, 422) } },
    delete: { tags: ['redirects'], summary: 'Delete a redirect', responses: { 200: json({ type: 'object', properties: { ok: { const: true } } }), ...errors(401, 403, 404) } },
  }

  return {
    openapi: '3.1.0',
    info: { title: info.title ?? 'Nuxt Atelier content API', version: info.version ?? '1' },
    security: [{ token: [] }, { session: [] }],
    paths,
    components: {
      schemas,
      securitySchemes: {
        token: { type: 'http', scheme: 'bearer', description: 'An API token (`atk_…`) an administrator created' },
        session: { type: 'apiKey', in: 'cookie', name: 'atelier-session', description: 'A signed-in session. Writes also send the `atelier-csrf` cookie\'s value in an `x-atelier-csrf` header' },
      },
      responses: Object.fromEntries([400, 401, 403, 404, 409, 422, 429].map(s => [`E${s}`, json(ref('Error'), {
        400: 'Invalid request or query (code `bad_request`, `invalid_query`)',
        401: 'Not signed in, or an invalid token (code `unauthenticated`)',
        403: 'Not allowed (code `forbidden`, `csrf`; `fields` names fields the caller can\'t change)',
        404: 'No such entry (code `not_found`)',
        409: 'Changed by someone else (code `conflict`, with `currentVersion`) or still referenced (code `referenced`)',
        422: 'Invalid data (code `validation_failed`, with `errors`)',
        429: 'Too many writes (code `rate_limited`)',
      }[s]!)])),
    },
  }
}
