// AI assist end to end (test/fixtures/ai, with a fake provider that records what it's sent): server-side
// keys, the permission, exclusions, limits, usage, suggestions in the admin, and the assistant, which
// can only propose what the user's own session then may or may not do.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createPage, fetch, setup, startServer, url } from '@nuxt/test-utils/e2e'
import { beforeAll, describe, expect, it } from 'vitest'

const rootDir = fileURLToPath(new URL('../fixtures/ai', import.meta.url))
const KEY = 'sk-test-secret-key-0123456789'
interface Session { cookie: string, csrf: string }

describe('AI assist', async () => {
  await setup({ setupTimeout: 300_000, rootDir, browser: true })
  const sessions: Record<string, Session> = {}
  const ids: Record<string, string> = {}

  async function api(as: string | null, method: string, path: string, body?: unknown) {
    const session = as ? sessions[as] : undefined
    const response = await fetch(path.startsWith('/') && !path.startsWith('/api') ? `/api/_atelier${path}` : path, {
      method,
      headers: { 'content-type': 'application/json', ...session ? { 'cookie': session.cookie, 'x-atelier-csrf': session.csrf } : {} },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await response.text()
    return { status: response.status, text, body: text ? JSON.parse(text) : undefined }
  }
  const sent = async () => (await (await fetch('/api/test/ai-sent')).json()) as { system: string, prompt: string, images: number }[]

  beforeAll(async () => {
    await startServer({ env: {
      NUXT_ATELIER_DATABASE_URL: `file:${join(mkdtempSync(join(tmpdir(), 'atelier-ai-')), 'db.sqlite')}`,
      NUXT_APP_SECRET: 'a-test-secret-that-is-long-enough-123456',
      NUXT_ATELIER_STORAGE_DIR: mkdtempSync(join(tmpdir(), 'atelier-ai-files-')),
      NUXT_AI_KEY: KEY,
    } })
    for (const [name, role] of [['admin', 'admin'], ['writer', 'writer'], ['reader', 'reader'], ['busy', 'writer']] as const) {
      const user = await (await fetch('/api/test/users', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `${name}@example.com`, role, password: 'password 123' }) })).json()
      ids[name] = user.id
      const signedIn = await fetch('/api/_atelier/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `${name}@example.com`, password: 'password 123' }) })
      const cookies = signedIn.headers.getSetCookie().map(c => c.split(';')[0]!)
      sessions[name] = { cookie: cookies.join('; '), csrf: cookies.find(c => c.startsWith('atelier-csrf='))!.split('=')[1]! }
    }
    ids.adminPost = (await api('admin', 'POST', '/collections/posts', { data: { title: 'The admin\'s post', body: 'Hello world, this is the body.', notes: 'TOP SECRET NOTE' } })).body.id
    ids.writerPost = (await api('writer', 'POST', '/collections/posts', { data: { title: 'Mine', body: 'Some text.' } })).body.id
  })

  it('works only for users with the ai capability, and keeps the provider key on the server', async () => {
    expect((await api('writer', 'GET', '/ai')).body).toEqual({ enabled: true })
    expect((await api('reader', 'GET', '/ai')).status).toBe(403)
    expect((await api(null, 'POST', '/ai/suggest', { action: 'rewrite', type: 'posts', field: 'body', text: 'x' })).status).toBe(401)
    const suggestion = await api('writer', 'POST', '/ai/suggest', { action: 'rewrite', type: 'posts', field: 'body', text: 'Hello world' })
    expect(suggestion.body).toEqual({ suggestion: 'Better: Hello world' })
    for (const answer of [suggestion.text, (await api('writer', 'GET', '/schema')).text, await (await fetch('/admin')).text()])
      expect(answer).not.toContain(KEY)
  })

  it('never sends excluded types and fields, nor fields the user can\'t read', async () => {
    await fetch('/api/test/ai-sent', { method: 'DELETE' })
    expect((await api('writer', 'POST', '/ai/suggest', { action: 'rewrite', type: 'posts', field: 'notes', text: 'TOP SECRET NOTE' })).status).toBe(403)
    expect((await api('writer', 'POST', '/ai/suggest', { action: 'shorten', type: 'secrets', field: 'value', text: 'hunter2' })).status).toBe(403)
    expect(await sent()).toEqual([]) // refused before the provider

    // SEO from the stored entry: its allowed fields only
    const seo = await api('writer', 'POST', '/ai/suggest', { action: 'seo', type: 'posts', id: ids.adminPost })
    expect(seo.body).toEqual({ suggestion: { title: 'A suggested title', description: 'A suggested description.' } })
    const [request] = await sent()
    expect(request!.prompt).toContain('Hello world, this is the body.')
    expect(request!.prompt).not.toContain('TOP SECRET NOTE')

    // the assistant is told about posts' allowed fields only, and nothing about secrets
    await api('writer', 'POST', '/ai/assistant', { request: 'list my posts' })
    const assistant = (await sent()).at(-1)!
    expect(assistant.system).toContain('collection "posts": fields title, body, seo')
    expect(assistant.system).not.toContain('notes')
    expect(assistant.system).not.toContain('secrets')
  })

  it('translates, keeping a block\'s structure, ids and links whatever the model returns', async () => {
    expect((await api('writer', 'POST', '/ai/suggest', { action: 'translate', type: 'posts', field: 'title', value: 'Hello', to: 'fr', from: 'en' })).body).toEqual({ suggestion: '[fr] Hello' })
    const block = { id: 'b1', type: 'Hero', props: { title: 'Hello', link: { href: '/about' } } }
    expect((await api('writer', 'POST', '/ai/suggest', { action: 'translate', type: 'posts', field: 'body', value: block, to: 'fr' })).body).toEqual({ suggestion: { id: 'b1', type: 'Hero', props: { title: 'Bonjour', link: { href: '/about' } } } })
  })

  it('limits requests per user per hour, and reports usage per user and action', async () => {
    let status = 200
    for (let i = 0; i < 30 && status === 200; i++)
      status = (await api('busy', 'POST', '/ai/suggest', { action: 'expand', type: 'posts', field: 'body', text: `Text ${i}` })).status
    expect(status).toBe(429)
    expect((await api('writer', 'POST', '/ai/suggest', { action: 'expand', type: 'posts', field: 'body', text: 'Still mine' })).status).toBe(200)

    const usage = (await api('admin', 'GET', '/ai/usage')).body as { name: string, action: string, requests: number, inputTokens: number, outputTokens: number }[]
    expect(usage.find(r => r.name === 'busy@example.com' && r.action === 'expand')).toMatchObject({ requests: 25, inputTokens: 250, outputTokens: 125 })
    expect(usage.find(r => r.name === 'writer@example.com' && r.action === 'seo')).toMatchObject({ requests: 1 })
    expect((await api('writer', 'GET', '/ai/usage')).status).toBe(403)
  })

  async function signIn(name: string) {
    const page = await createPage(url('/admin'))
    await page.getByLabel('Email').fill(`${name}@example.com`)
    await page.getByLabel('Password').fill('password 123')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.getByRole('heading', { name: 'Dashboard' }).waitFor()
    return page
  }

  it('shows a suggestion to accept or discard, never saving it, and undoes an accepted one', async () => {
    const page = await signIn('writer')
    await page.goto(url(`/admin/collections/posts/${ids.writerPost}`))
    const body = page.getByLabel('Body')
    await body.waitFor()
    await page.getByRole('button', { name: 'Rewrite' }).first().click()
    await page.locator('[data-ai-suggestion]').getByLabel('Suggestion').waitFor()
    await page.getByRole('button', { name: 'Discard' }).click()
    expect(await body.inputValue()).toBe('Some text.')

    await page.getByRole('button', { name: 'Rewrite' }).nth(1).click()
    await page.locator('[data-ai-suggestion]').getByLabel('Suggestion').fill('Edited suggestion')
    await page.getByRole('button', { name: 'Use it' }).click()
    expect(await body.inputValue()).toBe('Edited suggestion')
    await page.getByRole('button', { name: 'Undo' }).click()
    expect(await body.inputValue()).toBe('Some text.')
    // nothing was saved by any of it
    expect((await api('writer', 'GET', `/collections/posts/${ids.writerPost}`)).body.data.body).toBe('Some text.')
  })

  it('proposes requests from the command palette, sends only approved ones, as the user', async () => {
    const page = await signIn('writer')
    await page.keyboard.press('Control+k')
    await page.getByRole('combobox').fill(`delete the admin's post ${ids.adminPost}`)
    await page.getByRole('option', { name: /Ask the assistant/ }).click()
    const assistant = page.locator('[data-ai-assistant]')
    await assistant.getByText(`Delete post ${ids.adminPost}`).waitFor()
    // the proposal outside the content API was dropped
    expect(await assistant.getByText('Make a user').count()).toBe(0)
    // nothing goes without approval
    expect(await assistant.getByRole('button', { name: 'Send the approved requests' }).isDisabled()).toBe(true)
    expect((await api('admin', 'GET', `/collections/posts/${ids.adminPost}`)).status).toBe(200)

    await assistant.getByRole('checkbox').check()
    await assistant.getByRole('button', { name: 'Send the approved requests' }).click()
    await assistant.locator('[data-status="failed"]').getByText(/Refused/).waitFor()
    expect((await api('admin', 'GET', `/collections/posts/${ids.adminPost}`)).status).toBe(200) // a writer can't delete it, so it stands
  })
})
