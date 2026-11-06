import { fileURLToPath } from 'node:url'
import { $fetch, fetch, setup, startServer } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

describe('runtime config', async () => {
  await setup({ setupTimeout: 300_000, rootDir: fileURLToPath(new URL('../fixtures/basic', import.meta.url)) })

  it('uses the build-time defaults', async () => {
    expect(await $fetch('/api/runtime-config')).toEqual({
      databaseUrl: 'file:.data/atelier.sqlite',
      storageDir: '.data/uploads',
      siteUrl: '',
    })
    expect(await $fetch('/api/db')).toEqual({ dialect: 'sqlite' })
  })

  it('takes env overrides in the same build, without a rebuild', async () => {
    await startServer({ env: {
      NUXT_ATELIER_DATABASE_URL: 'postgres://cms@db:5432/atelier',
      NUXT_ATELIER_STORAGE_DIR: '/var/uploads',
      NUXT_PUBLIC_ATELIER_SITE_URL: 'https://example.com',
    } })
    expect(await $fetch('/api/runtime-config')).toEqual({
      databaseUrl: 'postgres://cms@db:5432/atelier',
      storageDir: '/var/uploads',
      siteUrl: 'https://example.com',
    })
  })

  it.runIf(process.env.ATELIER_TEST_POSTGRES_URL)('connects to another engine from the env alone', async () => {
    await startServer({ env: { NUXT_ATELIER_DATABASE_URL: process.env.ATELIER_TEST_POSTGRES_URL } })
    expect(await $fetch('/api/db')).toEqual({ dialect: 'postgres' })
  })

  it('answers a lost save race with 409 and the current version', async () => {
    const response = await fetch('/api/conflict')
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ message: expect.stringContaining('at version 3'), data: { currentVersion: 3 } })
  })
})
