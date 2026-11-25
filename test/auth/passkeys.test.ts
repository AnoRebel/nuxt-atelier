import type { Page } from 'playwright-core'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { $fetch, createPage, fetch, setup, startServer, url } from '@nuxt/test-utils/e2e'
import { sql } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { connect } from '../../packages/core/src/runtime/server/db/driver'
import { allDrivers } from '../../packages/core/src/runtime/server/db/loaders'
import { query } from '../storage/env'

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

  async function openPage(path = '/passkey-flows') {
    const page = await createPage()
    await page.goto(url(path).replace('127.0.0.1', 'localhost'))
    if (path === '/passkey-flows')
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

    // registration and passkey sign-ins are in the audit log
    const driver = await connect(database, { loaders: allDrivers })
    try {
      const events = await query(driver, sql`select action, actor_id, target_id from atelier_audit order by at`)
      expect(events).toContainEqual({ action: 'auth.passkey-added', actor_id: user.id, target_id: id })
      expect(events.filter(e => e.action === 'auth.sign-in' && e.actor_id === user.id)).toHaveLength(3) // password, passkey, passkey
    }
    finally {
      await driver.close()
    }

    // an administrator resets the password (an account taken over, say): the passkeys go with the old one
    await call(page, 'signOut')
    await $fetch('/api/test/users', { method: 'POST', body: { email: 'root@example.com', role: 'admin', password: 'root password' } })
    const admin = await fetch('/api/_atelier/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'root@example.com', password: 'root password' }) })
    const cookies = admin.headers.getSetCookie().map(c => c.split(';')[0]!)
    const reset = await fetch(`/api/_atelier/users/${user.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json', 'cookie': cookies.join('; '), 'x-atelier-csrf': cookies.find(c => c.startsWith('atelier-csrf='))!.split('=')[1]! }, body: JSON.stringify({ password: 'a new password' }) })
    expect(reset.status).toBe(200)
    await expect(call(page, 'signInWithPasskey')).rejects.toThrow()
    await page.close()
  })

  it('adds, lists and removes a passkey in the admin, and signs in to the admin with it', async () => {
    await $fetch('/api/test/users', { method: 'POST', body: { email: 'grace@example.com', role: 'editor', password: 'grace password' } })
    const { page } = await openPage('/admin')
    await page.getByLabel('Email').fill('grace@example.com')
    await page.getByLabel('Password').fill('grace password')
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await page.getByRole('heading', { name: 'Dashboard' }).waitFor()

    await page.locator('.app-account').first().click()
    await page.getByRole('menuitem', { name: 'Passkeys' }).click()
    const modal = page.getByRole('dialog', { name: 'Passkeys' })
    await modal.getByText('No passkeys yet.').waitFor()
    await modal.getByLabel('Name').fill('Test laptop')
    await modal.getByRole('button', { name: 'Add a passkey' }).click()
    await modal.getByText('Test laptop').waitFor()

    // signed out, the sign-in page's passkey button signs back in
    await page.keyboard.press('Escape')
    await page.locator('.app-account').first().click()
    await page.getByRole('menuitem', { name: 'Sign out' }).click()
    await page.getByRole('button', { name: 'Sign in with a passkey' }).click()
    await page.getByRole('heading', { name: 'Dashboard' }).waitFor()

    await page.locator('.app-account').first().click()
    await page.getByRole('menuitem', { name: 'Passkeys' }).click()
    await modal.getByRole('button', { name: 'Remove Test laptop' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
    await modal.getByText('No passkeys yet.').waitFor()
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
