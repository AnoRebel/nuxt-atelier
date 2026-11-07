import type { AtelierDriver } from '../../packages/core/src/runtime/server/db/driver'
import { execFile } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { gunzipSync } from 'node:zlib'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { exportToFile, importContent, importFromFile } from '../../packages/core/src/cli/transfer'
import { createEntryStore } from '../../packages/core/src/runtime/server/db/store'
import { buildTables } from '../../packages/core/src/runtime/server/db/tables'
import * as f from '../../packages/core/src/runtime/shared/fields'
import { connectEngine, createTables, resetDatabase, urlEngines } from './env'

const schema = {
  collections: {
    articles: {
      fields: {
        title: f.text({ required: true, unique: true }),
        views: f.number({ integer: true }),
        rating: f.number(),
        live: f.boolean(),
        published: f.date({ mode: 'datetime' }),
        body: f.richText(),
        blocks: f.blocks(),
        meta: f.json(),
        tags: f.relation({ to: 'tags', many: true }),
        faq: f.repeater({ fields: { q: f.text(), who: f.relation({ to: 'authors' }) } }),
      },
    },
    tags: { fields: { name: f.text() } },
    authors: { fields: { name: f.text() } },
  },
  singletons: { site: { fields: { name: f.text() } } },
}
const dir = mkdtempSync(join(tmpdir(), 'atelier-transfer-'))
const schemaFile = join(dir, 'schema.json')
writeFileSync(schemaFile, JSON.stringify(schema))

/** Every row of every table, in an engine-independent order. */
async function dump(driver: AtelierDriver) {
  const db = driver.db as any
  const out: Record<string, unknown[]> = {}
  for (const [name, table] of Object.entries(buildTables(driver.dialect, schema)))
    out[name] = (await db.select().from(table)).map((r: unknown) => JSON.stringify(r, Object.keys(r as object).toSorted())).toSorted()
  return out
}

async function fresh(url: string) {
  const driver = await connectEngine(url)
  await resetDatabase(driver)
  await createTables(driver, url, schemaFile)
  return driver
}

const [[, sourceUrl], ...targets] = urlEngines as [[string, string], ...[string, string][]] // SQLite always comes first
const archive = join(dir, 'export.ndjson.gz')
let source: AtelierDriver
let expected: Record<string, unknown[]>

beforeAll(async () => {
  source = await fresh(sourceUrl)
  const store = createEntryStore(source, schema)
  const a = await store.save('articles', { data: {
    title: 'Hello',
    views: 2 ** 40,
    rating: 4.25,
    live: true,
    published: '2026-11-03T09:30:00.000Z',
    body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] }] },
    blocks: [{ id: 'b1', type: 'hero', props: { title: 'Héllo ✨', items: [1, null, { deep: true }] } }],
    meta: 'just text',
    tags: ['t1', 't2'],
    faq: [{ q: 'Why?', who: 'a1' }],
  } })
  await store.save('articles', { id: a.id, version: 1, data: { ...a.data, title: 'Hello again', live: false } })
  for (let i = 0; i < 1200; i++) // more than two pages
    await store.save('articles', { data: { title: `Bulk ${i}`, views: i } })
  await store.saveSingleton('site', { data: { name: 'Atelier' } })
  expected = await dump(source)
  expect(await exportToFile(source, schema, archive)).toMatchObject({ atelier_c_articles: 1201, atelier_revisions: 1203, atelier_singletons: 1 })
}, 300_000)
afterAll(() => source?.close())

describe.each(targets)('export from SQLite, import into %s', (_, url) => {
  let target: AtelierDriver
  beforeAll(async () => {
    target = await fresh(url)
  }, 120_000)
  afterAll(() => target?.close())

  it('reproduces every entry, revision, relation and singleton exactly', async () => {
    await importFromFile(target, schema, archive)
    expect(await dump(target)).toEqual(expected)
  })

  it('refuses to import into a database that has content', async () => {
    await expect(importFromFile(target, schema, archive)).rejects.toThrow(/Import needs an empty database, but atelier_\w+ has \d+ rows/)
  })
})

describe('import safety', () => {
  it('leaves the database empty when a row fails partway', async () => {
    const target = await fresh(`file:${join(mkdtempSync(join(tmpdir(), 'atelier-bad-')), 'db.sqlite')}`)
    const lines = gunzipSync(readFileSync(archive)).toString('utf8').split('\n')
    lines.splice(5, 0, JSON.stringify({ table: 'atelier_c_articles', row: { _id: null } })) // NOT NULL violation
    await expect(importContent(target, schema, Readable.from(lines.join('\n')))).rejects.toThrow()
    expect(Object.values(await dump(target)).every(rows => rows.length === 0)).toBe(true)
    await target.close()
  })

  it('names the problem with a file that isn\'t an export', async () => {
    const target = await fresh(`file:${join(mkdtempSync(join(tmpdir(), 'atelier-bad-')), 'db.sqlite')}`)
    await expect(importContent(target, schema, Readable.from('{"hello":1}\n'))).rejects.toThrow('Not a Nuxt Atelier export')
    await expect(importContent(target, schema, Readable.from('{"format":"nuxt-atelier-export","version":1,"tables":["atelier_c_pages"]}\n')))
      .rejects.toThrow('tables this app\'s schema doesn\'t define: atelier_c_pages')
    await target.close()
  })
})

describe('atelier export / import commands', () => {
  const root = fileURLToPath(new URL('../fixtures/pending', import.meta.url))
  const cli = fileURLToPath(new URL('../../packages/core/dist/cli/index.mjs', import.meta.url))
  const atelier = (url: string, ...args: string[]) =>
    promisify(execFile)('node', [cli, ...args, '--root', root], { env: { ...process.env, NUXT_ATELIER_DATABASE_URL: url } })

  it('moves content between two databases of an app', async () => {
    const [from, to] = ['a', 'b'].map(n => `file:${join(dir, `cli-${n}.sqlite`)}`) as [string, string]
    const file = join(dir, 'cli.ndjson')
    await atelier(from, 'migrate', 'apply')
    const driver = await connectEngine(from)
    await createEntryStore(driver, { collections: { notes: { fields: { title: f.text() } } }, singletons: {} })
      .save('notes', { data: { title: 'Moved' } })
    await driver.close()

    expect((await atelier(from, 'export', file)).stdout).toMatch(/Exported \d+ rows/)
    await atelier(to, 'migrate', 'apply')
    expect((await atelier(to, 'import', file)).stdout).toContain('atelier_c_notes: 1')
    expect(readFileSync(file, 'utf8')).toContain('"title":"Moved"')
  })
})
