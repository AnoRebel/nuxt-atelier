// The headless admin composables against a mocked CMS API: what they request, and what they make of the answers.
import type { AdminSchema, Entry } from '../../packages/admin/src/runtime/types'
import { QueryClient, VUE_QUERY_CLIENT } from '@tanstack/vue-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'
import { titleField, useAtelierCollection } from '../../packages/admin/src/runtime/composables/useAtelierCollection'
import { useAtelierEntryForm } from '../../packages/admin/src/runtime/composables/useAtelierEntryForm'
import { useAtelierNavigation } from '../../packages/admin/src/runtime/composables/useAtelierNavigation'
import { useAtelierPermissions } from '../../packages/admin/src/runtime/composables/useAtelierPermissions'
import { useAtelierSession } from '../../packages/admin/src/runtime/composables/useAtelierSession'

const schema: AdminSchema = {
  user: { id: 'u1', role: 'writer' },
  capabilities: ['users'],
  locales: { codes: ['en'], default: 'en', fallback: {} },
  collections: [{
    name: 'posts',
    fields: { title: { type: 'text', required: true }, slug: { type: 'slug' }, views: { type: 'number' } },
    readOnly: ['slug'],
    can: { create: true, read: true, update: true, delete: false, publish: true },
    ownOnly: ['update'],
    routable: false,
    localized: false,
    versioned: true,
  }],
  singletons: [],
  blocks: {},
}
const entry = (id: string, data: Record<string, unknown>, version = 1): Entry =>
  ({ id, version, createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-02T00:00:00Z', createdBy: 'u1', publishedVersion: null, data })

interface Call { path: string, method: string, body?: unknown, query?: Record<string, unknown> }
let calls: Call[]
let respond: (call: Call) => unknown

beforeEach(() => {
  calls = []
  respond = ({ path }) => path === '/api/_atelier/schema' ? schema : undefined
  vi.stubGlobal('$fetch', vi.fn(async (path: string, options: { method?: string, body?: unknown, query?: Record<string, unknown> } = {}) => {
    const call = { path, method: options.method ?? 'GET', body: options.body, query: options.query }
    calls.push(call)
    return respond(call)
  }))
})
afterEach(() => vi.unstubAllGlobals())

/** Runs a composable with a fresh query client, as the admin page provides it. */
function withAdmin<T>(composable: () => T): T {
  const app = createApp({ render: () => null })
  app.provide(VUE_QUERY_CLIENT, new QueryClient({ defaultOptions: { queries: { retry: false } } }))
  return app.runWithContext(composable)
}

describe('headless admin composables', () => {
  it('signs in, then reads who is signed in again', async () => {
    let user: unknown = null
    respond = ({ path, body }) => {
      if (path === '/api/_atelier/auth/login') {
        user = { id: 'u1', email: (body as { email: string }).email, role: 'admin' }
        return user
      }
      return path === '/api/_atelier/auth/me' ? { user } : { needed: false }
    }
    const session = withAdmin(useAtelierSession)
    await vi.waitFor(() => expect(session.loading.value).toBe(false))
    expect(session.user.value).toBeNull()
    await session.signIn.mutateAsync({ email: 'ada@example.com', password: 'x' })
    await vi.waitFor(() => expect(session.user.value).toMatchObject({ email: 'ada@example.com' }))
    expect(calls.find(c => c.path.endsWith('/login'))).toMatchObject({ method: 'POST', body: { email: 'ada@example.com', password: 'x' } })
  })

  it('answers permissions and builds navigation from the schema', async () => {
    const { can, ownOnly, manages, canWrite, navigation } = withAdmin(() => ({ ...useAtelierPermissions(), navigation: useAtelierNavigation() }))
    await vi.waitFor(() => expect(can('read', 'posts')).toBe(true))
    expect(can('delete', 'posts')).toBe(false)
    expect(can('read', 'pages')).toBe(false)
    expect(ownOnly('update', 'posts')).toBe(true)
    expect(manages('users')).toBe(true)
    expect(manages('roles')).toBe(false)
    expect([canWrite('posts', 'title'), canWrite('posts', 'slug')]).toEqual([true, false])
    expect(navigation.items.value.map(i => [i.label, i.to])).toEqual([['Dashboard', '/admin'], ['Posts', '/admin/collections/posts'], ['Users', '/admin/users']])
  })

  it('lists drafts with the search on the title field, and reports bulk failures per entry', async () => {
    respond = ({ path }) => path === '/api/_atelier/schema'
      ? schema
      : path === '/api/_atelier/collections/posts'
        ? { items: [entry('a', { title: 'A, "quoted"' }), entry('b', { title: 'B' })], total: 2, next: null }
        : path.endsWith('/b/publish') ? Promise.reject(Object.assign(new Error('x'), { status: 409, data: { message: 'Changed since', data: { code: 'conflict' } } })) : {}
    const list = withAdmin(() => useAtelierCollection('posts'))
    await vi.waitFor(() => expect(list.entries.value).toHaveLength(2))
    list.state.search = 'hello'
    await vi.waitFor(() => expect(calls.at(-1)?.query?.filter).toBe(JSON.stringify({ title: { contains: 'hello' } })))
    expect(calls.at(-1)?.query).toMatchObject({ draft: 'true', sort: '-_updatedAt', limit: 25, offset: 0 })
    expect(list.state.columns).toEqual(['title'])

    const result = await list.publish.mutateAsync(list.entries.value)
    expect(result).toEqual({ succeeded: ['a'], failed: [{ id: 'b', error: { status: 409, message: 'Changed since', code: 'conflict' } }] })
    expect(calls.filter(c => c.path.endsWith('/publish')).map(c => c.body)).toEqual([{ version: 1 }, { version: 1 }])
    expect(list.exportEntries(list.entries.value, 'csv').split('\r\n')).toEqual([
      'id,title,createdAt,updatedAt',
      'a,"A, ""quoted""",2026-11-01T00:00:00Z,2026-11-02T00:00:00Z',
      'b,B,2026-11-01T00:00:00Z,2026-11-02T00:00:00Z',
    ])
    expect(titleField(schema.collections[0])).toBe('title')
  })

  it('validates before saving, saves with the version read, and puts server errors on their fields', async () => {
    respond = ({ path, method }) => {
      if (path === '/api/_atelier/schema')
        return schema
      if (method === 'GET')
        return entry('a', { title: 'Hello', views: 1 }, 3)
      return Promise.reject(Object.assign(new Error('x'), { status: 422, data: { message: 'Invalid', data: { code: 'validation_failed', errors: [{ path: 'views', message: 'too many' }] } } }))
    }
    const edit = withAdmin(() => useAtelierEntryForm({ kind: 'collection', name: 'posts', id: 'a' }))
    await vi.waitFor(() => expect(edit.form.state.values).toEqual({ title: 'Hello', views: 1 }))

    edit.form.setFieldValue('title', '')
    await edit.submit()
    expect(calls.some(c => c.method === 'PATCH')).toBe(false) // required title: not sent
    expect(edit.form.state.fieldMeta.title?.errors.length).toBeGreaterThan(0)

    edit.form.setFieldValue('title', 'Hi')
    edit.form.setFieldValue('views', 99)
    await edit.submit().catch(() => {}) // the 422 rejects
    expect(calls.find(c => c.method === 'PATCH')).toMatchObject({ path: '/api/_atelier/collections/posts/a', body: { version: 3, data: { title: 'Hi', views: 99 } } })
    expect(edit.form.state.fieldMeta.views?.errorMap).toMatchObject({ onServer: 'too many' })
  })
})
