import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { $fetch, createPage, fetch, setup, startServer, url } from '@nuxt/test-utils/e2e'
import { beforeAll, describe, expect, it } from 'vitest'

const rootDir = fileURLToPath(new URL('../fixtures/blocks', import.meta.url))

describe('blocks', async () => {
  await setup({ setupTimeout: 300_000, rootDir, browser: true })
  let cookie = ''
  let csrf = ''

  async function save(content: unknown[]) {
    const response = await fetch('/api/_atelier/collections/pages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie, 'x-atelier-csrf': csrf },
      body: JSON.stringify({ data: { title: 'Page', content } }),
    })
    return { status: response.status, body: await response.json() }
  }
  // without Vue's SSR fragment markers (<!--[-->, <!--]-->)
  const html = async (path: string) => (await (await fetch(path, { headers: { cookie } })).text()).replace(/<!--[[\]]-->/g, '')

  beforeAll(async () => {
    await startServer({ env: {
      NUXT_ATELIER_DATABASE_URL: `file:${join(mkdtempSync(join(tmpdir(), 'atelier-blocks-')), 'db.sqlite')}`,
      NUXT_APP_SECRET: 'a-test-secret-that-is-long-enough-123456',
    } })
    await $fetch('/api/test/users', { method: 'POST', body: { email: 'admin@example.com', role: 'admin', password: 'password 123' } })
    const signedIn = await fetch('/api/_atelier/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'password 123' }) })
    const cookies = signedIn.headers.getSetCookie().map(c => c.split(';')[0]!)
    cookie = cookies.join('; ')
    csrf = cookies.find(c => c.startsWith('atelier-csrf='))!.split('=')[1]!
  })

  it('renders blocks of both styles, nested areas through slots, and the app\'s override of a layer block', async () => {
    const { status, body } = await save([
      { id: 'b1', type: 'Hero', props: { title: 'Welcome', variant: 'dark', items: [
        { id: 'b2', type: 'Card', props: { heading: 'Inside the hero' } },
        { id: 'b3', type: 'Image', props: { alt: 'A picture' } },
      ] } },
      { id: 'b4', type: 'Columns', props: { left: [{ id: 'b5', type: 'Quote', props: { text: 'Hello', author: 'Ada' } }], right: [] } },
      { id: 'b6', type: 'Badge', props: { label: 'New', tone: 'warning' } },
      { id: 'b7', type: 'Note', props: { body: 'Scoped CSS only' } },
    ])
    expect(status).toBe(200)
    const page = await html(`/${body.id}`)
    expect(page).toMatch(/<section class="hero hero--dark"[^>]*><h1><span>Welcome<\/span><\/h1><div class="hero__items"><article class="card">\s*Inside the hero\s*<\/article><figure class="image">\s*A picture\s*<\/figure><\/div><\/section>/)
    expect(page).not.toContain('layer-hero') // the app's Hero replaces the layer's
    expect(page).toMatch(/<div class="left"><blockquote class="quote">\s*Hello <cite>Ada<\/cite><\/blockquote><\/div>/) // a layer block
    expect(page).not.toContain('class="right"') // an empty area passes no slot
    expect(page).toContain('<span class="badge" data-tone="warning">New</span>') // schema-file block, option as a prop
    expect(page).toMatch(/<aside class="note"[^>]*data-v-[^>]*>\s*Scoped CSS only\s*<\/aside>/)
  })

  it('adds editing attributes only to preview renders', async () => {
    const { body } = await save([
      { id: 'p1', type: 'Hero', props: { title: 'Attrs', items: [{ id: 'p2', type: 'Card', props: { heading: 'x' } }] } },
      { id: 'p3', type: 'Columns', props: { left: [{ id: 'p4', type: 'Card', props: { heading: 'y' } }], right: [] } },
    ])
    const publicPage = await html(`/${body.id}`)
    expect(publicPage).toContain('Attrs')
    expect(publicPage).not.toMatch(/data-at-/)
    const preview = await html(`/preview/${body.id}`)
    expect(preview).toContain('data-at-block="p1"')
    expect(preview).toContain('data-at-block="p2"')
    expect(preview).toContain('data-at-field="title"')
    expect(preview).toContain('class="right"') // in previews, empty areas keep their slot as a drop target
  })

  it('skips a block whose type no longer exists, rendering the rest', async () => {
    const { status, body } = await save([{ id: 'u1', type: 'Gone', props: {} }, { id: 'u2', type: 'Card', props: { heading: 'Still here' } }])
    expect(status).toBe(200) // stale content still saves
    const page = (await fetch(`/${body.id}`, { headers: { cookie } }))
    expect(page.status).toBe(200)
    expect(await page.text()).toMatch(/<article class="card">\s*Still here/)
  })

  it('refuses blocks placed against an area\'s rules, naming the area and the block', async () => {
    const hero = (items: unknown[]) => [{ id: 'h', type: 'Hero', props: { title: 'T', items } }]
    const denied = await save(hero([{ id: 'v', type: 'Video', props: { src: 'https://example.com/v.mp4' } }]))
    expect(denied.status).toBe(422)
    expect(denied.body.data.errors).toContainEqual({ path: 'content.0.props.items.0', message: '"Video" can\'t be placed in area "items" of Hero' })
    const notAllowed = await save(hero([{ id: 'q', type: 'Quote', props: { text: 'x' } }]))
    expect(notAllowed.body.data.errors).toContainEqual({ path: 'content.0.props.items.0', message: '"Quote" can\'t be placed in area "items" of Hero' })
    const tooMany = await save(hero([1, 2, 3, 4].map(i => ({ id: `c${i}`, type: 'Card', props: { heading: `${i}` } }))))
    expect(tooMany.body.data.errors).toContainEqual({ path: 'content.0.props.items', message: 'area "items" of Hero takes at most 3 blocks' })
    const tooFew = await save([{ id: 'col', type: 'Columns', props: { left: [] } }])
    expect(tooFew.body.data.errors).toContainEqual({ path: 'content.0.props.left', message: 'area "left" of Columns needs at least 1 blocks' })
    const badProps = await save(hero([{ id: 'c', type: 'Card', props: {} }]))
    expect(badProps.body.data.errors).toContainEqual({ path: 'content.0.props.items.0.props.heading', message: 'required' })
    const duplicate = await save([{ id: 'same', type: 'Card', props: { heading: 'a' } }, { id: 'same', type: 'Card', props: { heading: 'b' } }])
    expect(duplicate.body.data.errors).toContainEqual({ path: 'content.1.id', message: 'the block id "same" is used twice' })
  })

  it('re-renders a block when one of its options changes', async () => {
    const page = await createPage()
    await page.goto(url('/options'), { waitUntil: 'networkidle' })
    await page.waitForSelector('.hero--light')
    await page.click('#toggle')
    await page.waitForSelector('.hero--dark')
    expect(await page.locator('.hero').getAttribute('class')).toContain('hero--dark')
    await page.close()
  })
})
