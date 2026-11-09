import { execFile } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterAll, describe, expect, it } from 'vitest'

const rootDir = fileURLToPath(new URL('../fixtures/jobs-presets', import.meta.url))
const build = (preset: string) => promisify(execFile)('bunx', ['nuxi', 'build'], { cwd: rootDir, env: { ...process.env, NITRO_PRESET: preset }, maxBuffer: 64 * 1024 * 1024 })
const json = (path: string) => JSON.parse(readFileSync(join(rootDir, path), 'utf8'))

describe('the job schedule on serverless platforms', () => {
  afterAll(() => {
    for (const dir of ['.vercel', '.output', '.nuxt'])
      rmSync(join(rootDir, dir), { recursive: true, force: true })
  })

  it('becomes a Vercel cron calling the job trigger, and warns that local media storage won\'t last there', async () => {
    const { stdout, stderr } = await build('vercel')
    expect(stdout + stderr).toContain('Media uploads are stored on the server\'s disk (storage.driver "local"), which "vercel" doesn\'t keep between deploys')
    expect(json('.vercel/output/config.json').crons).toEqual([{ path: '/api/_atelier/jobs/run', schedule: '*/5 * * * *' }])
  }, 300_000)

  it('becomes a Cloudflare cron trigger, which Nitro hands to the atelier:jobs task', async () => {
    await build('cloudflare_module')
    expect(json('.output/server/wrangler.json').triggers).toEqual({ crons: ['*/5 * * * *'] })
    expect(readFileSync(join(rootDir, '.output/server/index.mjs'), 'utf8') + readFileSync(join(rootDir, '.output/server/chunks/nitro/nitro.mjs'), 'utf8')).toContain('atelier:jobs')
  }, 300_000)
})
