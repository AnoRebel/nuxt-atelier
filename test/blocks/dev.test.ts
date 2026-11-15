import { execFile } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { afterAll, describe, expect, it } from 'vitest'

const rootDir = fileURLToPath(new URL('../fixtures/blocks-dev', import.meta.url))
const card = fileURLToPath(new URL('../fixtures/blocks-dev/app/blocks/Card.vue', import.meta.url))
const original = readFileSync(card, 'utf8')
const notes = fileURLToPath(new URL('../fixtures/blocks-dev/server/atelier/collections/notes.ts', import.meta.url))
const originalNotes = readFileSync(notes, 'utf8')
const probe = join(rootDir, 'notes-probe.ts')
const migrations = join(rootDir, 'server/atelier/migrations/sqlite')
const committed = readdirSync(migrations)

describe('blocks in nuxt dev', async () => {
  // a fresh database: one left from an earlier run may hold tables from a migration renamed since
  process.env.NUXT_ATELIER_DATABASE_URL = `file:${join(mkdtempSync(join(tmpdir(), 'atelier-blocks-dev-')), 'db.sqlite')}`
  afterAll(() => { // registered before setup, so it runs after the server stops
    writeFileSync(card, original)
    writeFileSync(notes, originalNotes)
    rmSync(probe, { force: true })
    rmSync(join(rootDir, 'tsconfig.probe.json'), { force: true })
    // what `nuxt dev` generated for the edits: not the fixture's
    for (const dir of readdirSync(migrations).filter(d => !committed.includes(d)))
      rmSync(join(migrations, dir), { recursive: true })
    delete process.env.NUXT_ATELIER_DATABASE_URL
  })
  await setup({ rootDir, dev: true, setupTimeout: 300_000 })

  it('updates the server\'s block schemas when a block file changes, without a restart', async () => {
    expect(Object.keys((await $fetch<Record<string, { fields: object }>>('/api/blocks')).Card!.fields)).toEqual(['heading'])
    writeFileSync(card, original.replace('defineProps({ heading: text() })', 'defineProps({ heading: text(), subtitle: text({ maxLength: 40 }) })'))
    let fields: string[] = []
    for (let i = 0; i < 60 && fields.length < 2; i++) {
      await new Promise(resolve => setTimeout(resolve, 500))
      fields = Object.keys((await $fetch<Record<string, { fields: object }>>('/api/blocks').catch(() => ({ Card: { fields: {} } }))).Card?.fields ?? {})
    }
    expect(fields).toEqual(['heading', 'subtitle'])
  }, 60_000)
  it('types queries with a field added to a collection, and the server knows it, without a restart', async () => {
    // a typed read of the new field, checked with the types `nuxt dev` generated: an error until the definition has it
    const core = fileURLToPath(new URL('../../packages/core/src/', import.meta.url))
    const registry = (await promisify(execFile)('find', [join(rootDir, '.nuxt'), '-name', 'atelier-registry.d.ts'])).stdout.trim().split('\n')[0]!
    writeFileSync(probe, `import type { CollectionEntry } from '${core}runtime/shared/infer'\nexport const summary = (note: CollectionEntry<'notes'>): string | null | undefined => note.summary\n`)
    writeFileSync(join(rootDir, 'tsconfig.probe.json'), JSON.stringify({
      files: [probe, registry],
      compilerOptions: { noEmit: true, strict: true, skipLibCheck: true, module: 'preserve', moduleResolution: 'bundler', target: 'esnext', paths: { '#atelier/server': [`${core}runtime/server/index.ts`] } },
    }))
    // the probe's errors only (the module's own sources need the app's other aliases)
    const tsc = () => promisify(execFile)(process.execPath, [fileURLToPath(new URL('../../node_modules/typescript/bin/tsc', import.meta.url)), '-p', join(rootDir, 'tsconfig.probe.json')]).then(() => '', (error: { stdout: string }) => error.stdout.split('\n').filter(line => line.includes('notes-probe.ts')).join('\n'))
    const before = await tsc()
    expect(before).toMatch(/Property 'summary' does not exist/)
    expect(before).not.toMatch(/never/) // notes is known, only the field isn't

    writeFileSync(notes, originalNotes.replace('fields: { title: text() }', 'fields: { title: text(), summary: text() }'))
    let fields: string[] = []
    for (let i = 0; i < 60 && fields.length < 2; i++) {
      await new Promise(resolve => setTimeout(resolve, 500))
      fields = await $fetch<string[]>('/api/note-fields').catch(() => [])
    }
    expect(fields).toEqual(['title', 'summary'])
    expect(await tsc()).toBe('') // types come from the definition itself: nothing to regenerate
  }, 120_000)
})
