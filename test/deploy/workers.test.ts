// Cloudflare Workers: the guide's app built with its nuxt.config.ts and run in Miniflare (workerd) with the
// bindings its wrangler.json declares: the D1 database, the vars, and secrets as the guide puts them. With
// ATELIER_TEST_S3_URL (MinIO, test/compose.yml), the S3 vars point at it and the storage check must pass;
// without, only the database is checked. Its cron trigger runs the background jobs.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Miniflare, supportedCompatibilityDate } from 'miniflare'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { build, cleanup, enabled, ensureBucket, exampleApp, expectRunning, SECRET } from './deploy'

const s3 = process.env.ATELIER_TEST_S3_URL ? new URL(process.env.ATELIER_TEST_S3_URL) : undefined

describe.skipIf(!enabled)('Cloudflare Workers (examples/hosting/cloudflare-workers)', () => {
  let dir: string
  let mf: Miniflare | undefined
  let wrangler: { main: string, compatibility_date: string, compatibility_flags: string[], assets: { directory: string }, d1_databases: { binding: string, database_id: string }[], vars: Record<string, string>, triggers: { crons: string[] } }

  beforeAll(async () => {
    dir = await exampleApp('cloudflare-workers', { packages: ['@nuxt-atelier/storage-s3'] })
    await build(dir) // npm run build
    wrangler = JSON.parse(readFileSync(join(dir, 'wrangler.json'), 'utf8'))
    if (s3)
      await ensureBucket(s3)
  }, 900_000)
  afterAll(async () => {
    await mf?.dispose()
    cleanup(dir)
  })

  it('builds what wrangler.json deploys: its main module and assets directory', () => {
    expect(existsSync(join(dir, wrangler.main))).toBe(true)
    expect(existsSync(join(dir, wrangler.assets.directory, '_nuxt'))).toBe(true)
    // nuxt.config.ts names the D1 binding wrangler.json declares
    expect(readFileSync(join(dir, 'nuxt.config.ts'), 'utf8')).toContain(`url: 'd1:${wrangler.d1_databases[0]!.binding}'`)
  })

  it('runs in workerd with the D1 binding, vars and secrets, and answers the readiness check', async () => {
    // every module listed, the entry first (as test/storage/workers.test.ts: Miniflare refuses a non-literal
    // dynamic import it would have to discover)
    const server = join(dir, '.output/server')
    const modules = readdirSync(server, { recursive: true, encoding: 'utf8' })
      .filter(file => file.endsWith('.mjs'))
      .toSorted((a, b) => Number(b === 'index.mjs') - Number(a === 'index.mjs'))
      .map(file => ({ type: 'ESModule' as const, path: join(server, file) }))
    mf = new Miniflare({
      modulesRoot: server,
      modules,
      // workerd in the workspace may predate the example's date: the newest it supports, then
      compatibilityDate: [wrangler.compatibility_date, supportedCompatibilityDate].toSorted()[0],
      compatibilityFlags: wrangler.compatibility_flags,
      d1Databases: Object.fromEntries(wrangler.d1_databases.map(d => [d.binding, d.database_id])),
      bindings: {
        ...wrangler.vars,
        // the guide's secrets (wrangler secret put)
        NUXT_APP_SECRET: SECRET,
        NUXT_ATELIER_AUTH_SETUP_TOKEN: 'test-token',
        NUXT_ATELIER_S3_ACCESS_KEY_ID: s3 ? decodeURIComponent(s3.username) : 'test',
        NUXT_ATELIER_S3_SECRET_ACCESS_KEY: s3 ? decodeURIComponent(s3.password) : 'test',
        ...s3 && { NUXT_ATELIER_S3_ENDPOINT: s3.origin, NUXT_ATELIER_S3_BUCKET: s3.pathname.slice(1), NUXT_ATELIER_S3_REGION: 'us-east-1' },
      },
      port: 0,
    })
    const url = await mf.ready
    // Cloudflare serves the assets directory itself: not the Worker's part
    await expectRunning(url.origin, () => '', { storage: !!s3, assets: false })
  })

  it('runs the background jobs on its cron trigger', async () => {
    // a Fetcher's scheduled(), which Miniflare's types leave out
    const worker = await mf!.getWorker() as unknown as { scheduled: (event: { cron: string }) => Promise<{ outcome: string }> }
    expect(await worker.scheduled({ cron: wrangler.triggers.crons[0]! })).toMatchObject({ outcome: 'ok' })
  })
})
