import type { Page } from 'playwright-core'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { $fetch, createPage, fetch, setup, startServer, url } from '@nuxt/test-utils/e2e'
import { beforeAll, describe, expect, it } from 'vitest'

const rootDir = fileURLToPath(new URL('../fixtures/passkeys', import.meta.url))
const database = `file:${join(mkdtempSync(join(tmpdir(), 'atelier-passkeys-')), 'db.sqlite')}`

interface Atelier {
  signIn: (email: string, password: string) => Promise<unknown>
  signOut: () => Promise<unknown>
  me: () => Promise<{ user: { id: string, role: string } | null }>
  registerPasskey: () => Promise<{ id: string }>
  signInWithPasskey: () => Promise<{ id: string, role: string }>
}
const call = <K extends keyof Atelier>(page: Page, name: K, ...args: Parameters<Atelier[K]>) =>
  page.evaluate(([name, args]) => (window as unknown as { atelier: Record<string, (...a: unknown[]) => unknown> }).atelier[name]!(...args), [name, args] as const) as ReturnType<Atelier[K]>

describe('passkeys', async () => {
  await setup({
    rootDir,
    browser: true,
    // WebAuthn needs a domain as the relying party, not an IP: serve the page as localhost
    browserOptions: { type: 'chromium', launch: { args: ['--host-resolver-rules=MAP localhost 127.0.0.1'] } },
    setupTimeout: 300_000,
  })
  let user: { id: string }

  beforeAll(async () => {
    await startServer({ env: { NUXT_ATELIER_DATABASE_URL: database, NUXT_APP_SECRET: 'a-test-secret-that-is-long-enough-123456' } })
    user = await $fetch('/api/test/users', { method: 'POST', body: { email: 'ada@example.com', role: 'editor', password: 'a password' } })
  })

  async function openPage() {
    const page = await createPage()
    await page.goto(url('/').replace('127.0.0.1', 'localhost'))
    await page.waitForSelector('body[data-ready]')
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('WebAuthn.enable')
    const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
      options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
    })
    return { page, cdp, authenticatorId }
  }

  it('registers a passkey after a password sign-in, then signs in with it as the same user', async () => {
    const { page, cdp, authenticatorId } = await openPage()
    await call(page, 'signIn', 'ada@example.com', 'a password')
    const { id } = await call(page, 'registerPasskey')
    expect(id).toBeTruthy()

    await call(page, 'signOut')
    expect((await call(page, 'me')).user).toBeNull()
    expect(await call(page, 'signInWithPasskey')).toMatchObject({ id: user.id, role: 'editor' })
    expect((await call(page, 'me')).user).toMatchObject({ id: user.id, role: 'editor' })

    // the signature counter moved, and a second sign-in still verifies against the stored one
    await call(page, 'signOut')
    expect(await call(page, 'signInWithPasskey')).toMatchObject({ id: user.id })
    const { credentials } = await cdp.send('WebAuthn.getCredentials', { authenticatorId })
    expect(credentials[0]!.signCount).toBeGreaterThan(1)
    await page.close()
  })

  it('refuses registration without a session, and sign-in without a challenge or with an unknown passkey', async () => {
    expect((await fetch('/api/_atelier/auth/passkeys/register-options', { method: 'POST' })).status).toBe(401)
    const body = JSON.stringify({ response: { id: 'unknown', rawId: 'unknown', type: 'public-key', response: {} } })
    expect((await fetch('/api/_atelier/auth/passkeys/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body })).status).toBe(400)

    const options = await fetch('/api/_atelier/auth/passkeys/login-options', { method: 'POST' })
    const cookie = options.headers.getSetCookie()[0]!.split(';')[0]!
    expect((await fetch('/api/_atelier/auth/passkeys/login', { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body })).status).toBe(401)
  })
})
