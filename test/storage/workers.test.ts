// Workers smoke test: the workers fixture built with the cloudflare-module preset, run in Miniflare
// (workerd) with a local D1 database. Migrations auto-apply as one batch; saves run as D1 batches. With
// ATELIER_TEST_S3_URL (an S3 test server), media is stored on S3 and served by the Worker: originals, since a Worker has
// no sharp to size images.
import { execFile } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { AwsClient } from 'aws4fetch'
import { Miniflare } from 'miniflare'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// the app's own nuxi, not npx: npm reads the root package.json, whose Bun overrides it rejects
const NUXI = fileURLToPath(new URL('../fixtures/workers/node_modules/.bin/nuxi', import.meta.url))

const rootDir = fileURLToPath(new URL('../fixtures/workers', import.meta.url))
const s3 = process.env.ATELIER_TEST_S3_URL ? new URL(process.env.ATELIER_TEST_S3_URL) : undefined
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), c => c.charCodeAt(0))

describe('Cloudflare Workers with D1', () => {
  let mf: Miniflare
  const request = async (method: string, path: string, body?: unknown) => {
    const response = await mf.dispatchFetch(`http://localhost${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return { status: response.status, body: await response.json() as any }
  }

  beforeAll(async () => {
    await promisify(execFile)(NUXI, ['build'], { cwd: rootDir })
    // every module listed: discovering them, Miniflare refuses a non-literal dynamic import (file-type has
    // one, for reading files, which is never called), where Wrangler's bundling leaves it alone
    const server = `${rootDir}/.output/server`
    const modules = readdirSync(server, { recursive: true, encoding: 'utf8' })
      .filter(file => file.endsWith('.mjs'))
      .toSorted((a, b) => Number(b === 'index.mjs') - Number(a === 'index.mjs')) // the entry first
      .map(file => ({ type: 'ESModule' as const, path: join(server, file) }))
    mf = new Miniflare({
      modulesRoot: server,
      modules,
      compatibilityDate: '2026-08-01',
      compatibilityFlags: ['nodejs_compat'],
      d1Databases: ['DB'],
      bindings: s3
        ? { NUXT_ATELIER_S3_ENDPOINT: s3.origin, NUXT_ATELIER_S3_BUCKET: s3.pathname.slice(1), NUXT_ATELIER_S3_REGION: 'us-east-1', NUXT_ATELIER_S3_ACCESS_KEY_ID: decodeURIComponent(s3.username), NUXT_ATELIER_S3_SECRET_ACCESS_KEY: decodeURIComponent(s3.password) }
        : {},
    })
    if (s3) { // the bucket, made when missing (a fresh server has none)
      const client = new AwsClient({ accessKeyId: decodeURIComponent(s3.username), secretAccessKey: decodeURIComponent(s3.password), region: 'us-east-1', service: 's3' })
      for (let attempt = 0; attempt < 30 && !(await client.fetch(`${s3.origin}${s3.pathname}`, { method: 'PUT' }).then(r => r.ok || r.status === 409, () => false)); attempt++)
        await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }, 300_000)
  afterAll(() => mf?.dispose())

  it('creates, updates and refuses a stale update', async () => {
    const created = await request('POST', '/api/notes', { title: 'On the edge' })
    expect(created).toMatchObject({ status: 200, body: { version: 1, data: { title: 'On the edge' } } })
    const { id } = created.body

    expect(await request('PUT', `/api/notes/${id}`, { version: 1, data: { title: 'Edited' } }))
      .toMatchObject({ status: 200, body: { version: 2 } })
    expect(await request('PUT', `/api/notes/${id}`, { version: 1, data: { title: 'Stale' } }))
      .toMatchObject({ status: 409, body: { data: { currentVersion: 2 } } })
    expect(await request('GET', `/api/notes/${id}`)).toMatchObject({ body: { version: 2, data: { title: 'Edited' } } })
  })

  it('reports validation errors from the Worker', async () => {
    expect(await request('POST', '/api/notes', { title: '' }))
      .toMatchObject({ status: 422, body: { data: { errors: [{ path: 'title', message: 'required' }] } } })
  })

  it.skipIf(!s3)('stores media on S3 and serves the original, sized or not, from the Worker', async () => {
    const uploaded = await mf.dispatchFetch('http://localhost/api/media?filename=pixel.png', { method: 'POST', body: PNG })
    expect(uploaded.status).toBe(200)
    const item = await uploaded.json() as { key: string, mime: string }
    expect(item.mime).toBe('image/png')
    for (const query of ['', '?w=640']) {
      const served = await mf.dispatchFetch(`http://localhost/_atelier/media/${item.key}${query}`)
      expect(served.status).toBe(200)
      expect(served.headers.get('content-type')).toBe('image/png')
      expect(new Uint8Array(await served.arrayBuffer())).toEqual(PNG)
    }
  })
})
