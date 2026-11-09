// Workers smoke test: the workers fixture built with the cloudflare-module preset, run in Miniflare
// (workerd) with a local D1 database. Migrations auto-apply as one batch; saves run as D1 batches.
import { execFile } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { Miniflare } from 'miniflare'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const rootDir = fileURLToPath(new URL('../fixtures/workers', import.meta.url))

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
    await promisify(execFile)('npx', ['nuxi', 'build'], { cwd: rootDir })
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
    })
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
})
