import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { $fetch, fetch, setup, startServer } from '@nuxt/test-utils/e2e'
import { beforeAll, describe, expect, it } from 'vitest'

const rootDir = fileURLToPath(new URL('../fixtures/plugin-host', import.meta.url))

describe('a plugin installed as a Nuxt module', async () => {
  await setup({ setupTimeout: 300_000, rootDir })
  let cookie = ''
  let csrf = ''
  const api = async (path: string, method = 'GET', body?: unknown) => {
    const response = await fetch(path, { method, headers: { 'content-type': 'application/json', cookie, 'x-atelier-csrf': csrf }, ...body === undefined ? {} : { body: JSON.stringify(body) } })
    return { status: response.status, body: await response.json() }
  }

  beforeAll(async () => {
    await startServer({ env: {
      NUXT_ATELIER_DATABASE_URL: `file:${join(mkdtempSync(join(tmpdir(), 'atelier-plugin-')), 'db.sqlite')}`,
      NUXT_APP_SECRET: 'a-test-secret-that-is-long-enough-123456',
    } })
    await $fetch('/api/test/users', { method: 'POST', body: { email: 'admin@example.com', role: 'admin', password: 'password 123' } })
    const signedIn = await fetch('/api/_atelier/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'password 123' }) })
    const cookies = signedIn.headers.getSetCookie().map(c => c.split(';')[0]!)
    cookie = cookies.join('; ')
    csrf = cookies.find(c => c.startsWith('atelier-csrf='))!.split('=')[1]!
  })

  it('contributes a collection with its own field type, a block, a hook and a job', async () => {
    expect(await $fetch('/api/test/blocks')).toContain('EventCard')

    const invalid = await api('/api/_atelier/collections/events', 'POST', { data: { title: 'Launch', startsOn: '2027-03-01', venue: { lat: 120, lng: 0 } } })
    expect(invalid.body.data.errors).toEqual([{ path: 'venue', message: 'expected { lat, lng } in degrees' }])

    const event = await api('/api/_atelier/collections/events', 'POST', { data: { title: 'Launch', startsOn: '2027-03-01', venue: { lat: 59.437, lng: 24.7536 } } })
    expect(event.status).toBe(200)
    expect(event.body.data.venue).toEqual({ lat: 59.437, lng: 24.7536 })

    // the plugin's hook queued its job: a reminder the day before
    const [reminder] = (await api('/api/_atelier/jobs')).body.filter((j: { name: string }) => j.name === 'events:remind')
    expect(reminder).toMatchObject({ key: `events:remind:${event.body.id}`, payload: { id: event.body.id }, runAt: '2027-02-28T00:00:00.000Z' })
  })
})
