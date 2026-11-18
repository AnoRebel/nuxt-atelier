// Forms end to end (test/fixtures/blocks): a definition checked on save, the form block on a page,
// submissions checked again on the server, spam dropped quietly, private files, notifications, exports,
// erasure, and an accessible form.
import { mkdtempSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { $fetch, createPage, fetch, setup, startServer, url } from '@nuxt/test-utils/e2e'
import { beforeAll, describe, expect, it } from 'vitest'

const rootDir = fileURLToPath(new URL('../fixtures/blocks', import.meta.url))
const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')

describe('forms', async () => {
  await setup({ setupTimeout: 300_000, rootDir, browser: true })
  let cookie = ''
  let csrf = ''
  let formId = ''
  let contactPage = ''

  async function send(method: string, path: string, body?: unknown, signedIn = true) {
    const response = await fetch(`/api/_atelier${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...signedIn ? { cookie, 'x-atelier-csrf': csrf } : {} },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return { status: response.status, body: await response.json().catch(() => undefined), response }
  }
  const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
  /** A fresh token, old enough to pass the minimum fill time (1 s here). */
  async function token() {
    const { token } = (await send('GET', `/forms/${formId}`, undefined, false)).body
    await pause(1100)
    return token as string
  }
  const submit = async (values: Record<string, unknown>) => send('POST', `/forms/${formId}/submit`, { _token: await token(), ...values }, false)

  beforeAll(async () => {
    await startServer({ env: {
      NUXT_ATELIER_DATABASE_URL: `file:${join(mkdtempSync(join(tmpdir(), 'atelier-forms-')), 'db.sqlite')}`,
      NUXT_APP_SECRET: 'a-test-secret-that-is-long-enough-123456',
      NUXT_ATELIER_FORMS_MIN_FILL_TIME: '1',
      NUXT_ATELIER_MAIL_URL: 'resend://re_test',
      NUXT_ATELIER_MAIL_FROM: 'Site <site@example.com>',
      NUXT_ATELIER_STORAGE_DIR: mkdtempSync(join(tmpdir(), 'atelier-forms-files-')),
    } })
    await $fetch('/api/test/users', { method: 'POST', body: { email: 'admin@example.com', role: 'admin', password: 'password 123' } })
    const signedIn = await fetch('/api/_atelier/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'password 123' }) })
    const cookies = signedIn.headers.getSetCookie().map(c => c.split(';')[0]!)
    cookie = cookies.join('; ')
    csrf = cookies.find(c => c.startsWith('atelier-csrf='))!.split('=')[1]!
  })

  it('refuses a broken definition, and publishes a good one', async () => {
    const broken = await send('POST', '/collections/atelier-forms', { data: { title: 'Broken', fields: [{ name: 'a', type: 'text', label: 'A' }, { name: 'a', type: 'select', label: 'B' }] } })
    expect(broken).toMatchObject({ status: 422, body: { data: { errors: [{ path: 'fields.1.name' }, { path: 'fields.1.options' }] } } })

    const created = await send('POST', '/collections/atelier-forms', { publish: true, data: {
      title: 'Contact',
      fields: [
        { name: 'name', type: 'text', label: 'Your name', labels: { de: 'Ihr Name' }, required: true },
        { name: 'email', type: 'email', label: 'Email', required: true },
        { name: 'message', type: 'textarea', label: 'Message', required: true },
        { name: 'cv', type: 'file', label: 'CV', accept: 'application/pdf', maxSize: 1 },
        { name: 'agree', type: 'consent', label: 'You may store my message', required: true },
        { name: 'source', type: 'hidden', label: 'Source', value: 'website' },
      ],
      success: { message: 'Thanks, we\'ll be in touch.' },
      notify: { to: 'team@example.com', subject: 'New message' },
      confirmation: { enabled: true },
    } })
    expect(created.status).toBe(200)
    formId = created.body.id
    const form = (await send('GET', `/forms/${formId}?locale=de`, undefined, false)).body
    expect(form).toMatchObject({ title: 'Contact', token: expect.any(String), challenge: null })
    expect(form.fields[0]).toMatchObject({ name: 'name', label: 'Ihr Name' })
    expect(form.fields[0]).not.toHaveProperty('labels')
  })

  it('rejects a submission that skipped the browser\'s checks, storing nothing', async () => {
    const result = await submit({ name: 'Ada', email: 'not-an-email', agree: false })
    expect(result.status).toBe(422)
    expect(result.body.data.errors.map((e: { path: string }) => e.path).toSorted()).toEqual(['agree', 'email', 'message'])
    expect((await send('GET', `/forms/${formId}/submissions`)).body.total).toBe(0)
  })

  it('drops spam quietly: a filled honeypot, or sent faster than a person types', async () => {
    const valid = { name: 'Bot', email: 'bot@example.com', message: 'Buy', agree: true }
    expect(await submit({ ...valid, _hp: 'https://spam.example' })).toMatchObject({ status: 200, body: { ok: true } })
    const { token: fresh } = (await send('GET', `/forms/${formId}`, undefined, false)).body
    expect(await send('POST', `/forms/${formId}/submit`, { ...valid, _token: fresh }, false)).toMatchObject({ status: 200, body: { ok: true } })
    expect((await send('POST', `/forms/${formId}/submit`, { ...valid, _token: 'forged' }, false)).status).toBe(400)
    expect((await send('GET', `/forms/${formId}/submissions`)).body.total).toBe(0)
  })

  it('stores a submission with a private file, notifies, exports, and erases on request', async () => {
    const body = new FormData()
    for (const [key, value] of Object.entries({ _token: await token(), name: 'Jane', email: 'jane@example.com', message: '=HYPERLINK("x")', agree: 'on', source: 'forged' }))
      body.append(key, value)
    body.append('cv', new File(['%PDF-1.4 cv'], 'cv.pdf', { type: 'application/pdf' }))
    const response = await fetch(`/api/_atelier/forms/${formId}/submit`, { method: 'POST', body })
    expect(await response.json()).toEqual({ ok: true, message: 'Thanks, we\'ll be in touch.' })

    const list = (await send('GET', `/forms/${formId}/submissions`)).body
    expect(list.total).toBe(1)
    const [submission] = list.items
    expect(submission).toMatchObject({ version: 1, data: { name: 'Jane', agree: true, source: 'website', cv: { name: 'cv.pdf', type: 'application/pdf', size: 11 } } })

    // the file: only for those who manage submissions; nothing public serves it
    const file = `/forms/${formId}/submissions/${submission.id}/files/cv`
    expect(await (await fetch(`/api/_atelier${file}`, { headers: { cookie } })).text()).toBe('%PDF-1.4 cv')
    expect((await send('GET', file, undefined, false)).status).toBe(401)
    expect((await fetch(`/_atelier/media/${submission.id}/cv-cv.pdf`)).status).toBe(404)

    // the team and the sender are emailed through the job queue
    const mails = (await send('GET', '/jobs')).body.filter((j: { name: string }) => j.name === 'atelier:mail').map((j: { payload: { to: string } }) => j.payload.to)
    expect(mails.toSorted()).toEqual(['jane@example.com', 'team@example.com'])

    const csv = await (await fetch(`/api/_atelier/forms/${formId}/submissions?format=csv`, { headers: { cookie } })).text()
    expect(csv.split('\r\n')[0]).toBe('submitted,locale,version,name,email,message,cv,agree,source')
    expect(csv).toContain(',"\'=HYPERLINK(""x"")",cv.pdf,true,website') // formulas stay text
    expect((await send('GET', `/forms/${formId}/submissions?format=json`)).body).toHaveLength(1)
    expect((await send('GET', `/forms/${formId}/submissions`, undefined, false)).status).toBe(401)

    expect((await send('POST', '/forms/erase', { email: 'JANE@example.com' })).body).toEqual({ deleted: 1 })
    expect((await send('GET', `/forms/${formId}/submissions`)).body.total).toBe(0)
    expect((await fetch(`/api/_atelier${file}`, { headers: { cookie } })).status).toBe(404)
  })

  it('renders the form block on a page, accessibly, and sends it', async () => {
    const page = (await send('POST', '/collections/pages', { data: { title: 'Contact us', content: [{ id: 'f', type: 'AtelierForm', props: { form: formId } }] } })).body
    contactPage = page.id
    const browser = await createPage(url(`/${page.id}`))
    await browser.getByLabel('Your name').waitFor()
    await browser.addScriptTag({ content: axeSource })
    const violations = await browser.evaluate(async () => {
      const axe = (window as unknown as { axe: { run: (context: unknown, options: unknown) => Promise<{ violations: { id: string, impact: string }[] }> } }).axe
      const result = await axe.run({ include: [['.atelier-form']] }, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })
      return result.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id)
    })
    expect(violations).toEqual([])

    await browser.getByRole('button', { name: 'Send' }).click()
    await browser.getByText('required').first().waitFor() // the browser's checks, before sending
    await browser.getByLabel('Your name').fill('Grace')
    await browser.getByLabel('Email').fill('grace@example.com')
    await browser.getByLabel(/^Message/).fill('Hello from the page')
    await browser.getByLabel('You may store my message').check()
    await pause(1100)
    await browser.getByRole('button', { name: 'Send' }).click()
    await browser.getByRole('status').getByText('Thanks, we\'ll be in touch.').waitFor()
    expect((await send('GET', `/forms/${formId}/submissions`)).body.items[0].data).toMatchObject({ name: 'Grace', message: 'Hello from the page' })
  })

  it('sends the form from a browser signed in to the admin (with the CSRF header its session asks for)', async () => {
    const browser = await createPage()
    await browser.context().addCookies(cookie.split('; ').map((c) => {
      const [name, value] = c.split('=') as [string, string]
      return { name, value, url: url('/') }
    }))
    await browser.goto(url(`/${contactPage}`))
    await browser.getByLabel('Your name').fill('Ada')
    await browser.getByLabel('Email').fill('ada@example.com')
    await browser.getByLabel(/^Message/).fill('Sent while signed in')
    await browser.getByLabel('You may store my message').check()
    await pause(1100)
    await browser.getByRole('button', { name: 'Send' }).click()
    await browser.getByRole('status').getByText('Thanks, we\'ll be in touch.').waitFor()
  })
})
