// Vercel and Netlify can't run locally: their guides' apps are built as the platform builds them (it sets
// VERCEL or NETLIFY, and Nitro picks the preset from it), and the output checked to be that platform's.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { build, cleanup, enabled, envExample, EXAMPLES, exampleApp, parseConfig } from './deploy'

// the platform's build environment, not the CI's: on GitHub Actions, Nitro would see GITHUB_ACTIONS first
// and pick another preset
const NOT_CI = { GITHUB_ACTIONS: '' }

describe.skipIf(!enabled)('Vercel (examples/hosting/vercel)', () => {
  let dir: string
  beforeAll(async () => {
    dir = await exampleApp('vercel', { packages: ['pg', '@nuxt-atelier/storage-vercel-blob'], dialects: ['postgres'] })
    await build(dir, { ...NOT_CI, VERCEL: '1' })
  }, 900_000)
  afterAll(() => cleanup(dir))

  it('builds Vercel\'s output: the server function, the static files, and the cron Nuxt Atelier adds', () => {
    const output = join(dir, '.vercel/output')
    const config = JSON.parse(readFileSync(join(output, 'config.json'), 'utf8'))
    expect(config.version).toBe(3)
    expect(config.crons).toContainEqual({ path: '/api/_atelier/jobs/run', schedule: expect.any(String) })
    const functions = readdirSync(join(output, 'functions')).filter(f => f.endsWith('.func'))
    expect(functions.length).toBeGreaterThan(0)
    const vc = JSON.parse(readFileSync(join(output, 'functions', functions[0]!, '.vc-config.json'), 'utf8'))
    expect(vc.runtime).toMatch(/^nodejs/)
    expect(existsSync(join(output, 'static/_nuxt'))).toBe(true)
  })

  it('.env.example: the cron\'s secret is the trigger endpoint\'s', () => {
    const env = envExample(join(EXAMPLES, 'vercel/.env.example'))
    expect(Object.keys(env)).toEqual(expect.arrayContaining(['CRON_SECRET', 'NUXT_ATELIER_JOBS_SECRET', 'NUXT_APP_SECRET', 'NUXT_ATELIER_DATABASE_URL', 'BLOB_READ_WRITE_TOKEN']))
  })
})

describe.skipIf(!enabled)('Netlify (examples/hosting/netlify)', () => {
  let dir: string
  let toml: { build: { command: string, publish: string } }
  beforeAll(async () => {
    dir = await exampleApp('netlify', { packages: ['pg', '@nuxt-atelier/storage-s3'], dialects: ['postgres'] })
    toml = await parseConfig(join(dir, 'netlify.toml'))
    const [command, ...args] = toml.build.command.split(' ')
    await build(dir, { ...NOT_CI, NETLIFY: 'true' }, [command!, ...args])
  }, 900_000)
  afterAll(() => cleanup(dir))

  it('builds Netlify\'s output: the static files where netlify.toml publishes, and the server function', () => {
    expect(existsSync(join(dir, toml.build.publish, '_nuxt'))).toBe(true)
    const functions = join(dir, '.netlify/functions-internal')
    expect(readdirSync(functions).length).toBeGreaterThan(0)
  })

  it('.env.example: the trigger endpoint\'s secret, and S3 storage', () => {
    const env = envExample(join(EXAMPLES, 'netlify/.env.example'))
    expect(Object.keys(env)).toEqual(expect.arrayContaining(['NUXT_ATELIER_JOBS_SECRET', 'NUXT_APP_SECRET', 'NUXT_ATELIER_DATABASE_URL', 'NUXT_ATELIER_S3_BUCKET', 'NUXT_ATELIER_S3_ENDPOINT']))
  })
})
