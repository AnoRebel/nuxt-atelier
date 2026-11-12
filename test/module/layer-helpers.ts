import type { Page } from 'playwright-core'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** A fresh database and a secret, for a fixture serving the admin. */
export const adminEnv = (name: string) => ({
  NUXT_ATELIER_DATABASE_URL: `file:${join(mkdtempSync(join(tmpdir(), `atelier-${name}-`)), 'db.sqlite')}`,
  NUXT_APP_SECRET: 'a-test-secret-that-is-long-enough-123456',
})

/** First-run setup in the admin, signed in after. */
export async function firstAdmin(page: Page) {
  await page.getByLabel('Email').fill('ada@example.com')
  await page.getByLabel('Password').fill('password 123')
  await page.getByRole('button', { name: 'Create administrator' }).click()
}
