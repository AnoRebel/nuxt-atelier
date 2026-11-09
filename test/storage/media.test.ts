import type { AtelierDriver } from '../../packages/core/src/runtime/server/db/driver'
import type { Filter } from '../../packages/core/src/runtime/server/db/query'
import type { MediaLibrary } from '../../packages/core/src/runtime/server/media/library'
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createMediaLibrary, UploadError } from '../../packages/core/src/runtime/server/media/library'
import { createLocalDriver } from '../../packages/core/src/runtime/server/media/storage'
import { connectEngine, createTables, engines, resetDatabase } from './env'

const schemaFile = join(mkdtempSync(join(tmpdir(), 'atelier-media-')), 'schema.json')
writeFileSync(schemaFile, JSON.stringify({ collections: {}, singletons: {} }))

const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), c => c.charCodeAt(0))
// a Windows executable's header, whatever the file is called
const EXE = (() => {
  const bytes = new Uint8Array(512)
  bytes.set([0x4D, 0x5A], 0) // MZ
  bytes.set([0x80, 0, 0, 0], 0x3C) // offset of the PE header
  bytes.set([0x50, 0x45, 0, 0], 0x80) // PE\0\0
  return bytes
})()

/** A stream of `bytes`, in chunks of 7, like a network body. */
const stream = (bytes: Uint8Array) => new ReadableStream<Uint8Array>({
  start(controller) {
    for (let i = 0; i < bytes.length; i += 7)
      controller.enqueue(bytes.slice(i, i + 7))
    controller.close()
  },
})

describe.each(engines)('%s media library', (_, url) => {
  let driver: AtelierDriver
  let library: MediaLibrary
  const dir = mkdtempSync(join(tmpdir(), 'atelier-uploads-'))

  beforeAll(async () => {
    driver = await connectEngine(url)
    await resetDatabase(driver)
    await createTables(driver, url, schemaFile)
    library = createMediaLibrary(driver, createLocalDriver(dir), { maxUploadSize: 1000 })
  }, 120_000)
  afterAll(() => driver?.close())

  it('stores an upload under its id, its type from its content', async () => {
    const item = await library.upload({ body: stream(PNG), filename: 'Team photo (final).jpg', createdBy: 'u1' })
    expect(item).toMatchObject({ mime: 'image/png', size: PNG.length, filename: 'Team photo (final).jpg', key: `${item.id}/Team-photo-final-.jpg`, folder: '', tags: [], private: false })
    expect(readFileSync(join(dir, item.key))).toEqual(Buffer.from(PNG))
    const stored = (await library.storage.get(item.key))!
    expect(stored.size).toBe(PNG.length)
    expect(new Uint8Array(await new Response(stored.stream).arrayBuffer())).toEqual(PNG)
    // still there for a new driver on the same directory, as after a restart
    const restarted = await createLocalDriver(dir).get(item.key)
    expect(new Uint8Array(await new Response(restarted!.stream).arrayBuffer())).toEqual(PNG)
  })

  it('refuses a disguised executable and a file past the size limit, keeping nothing', async () => {
    const before = readdirSync(dir).length
    await expect(library.upload({ body: stream(EXE), filename: 'photo.jpg', createdBy: null })).rejects.toMatchObject({ statusCode: 415, message: expect.stringContaining('application/x-msdownload files aren\'t allowed here') })
    await expect(library.upload({ body: stream(new TextEncoder().encode('just some text')), filename: 'notes.png', createdBy: null })).rejects.toMatchObject({ statusCode: 415 })
    const big = new Uint8Array(2000)
    big.set(PNG)
    await expect(library.upload({ body: stream(big), filename: 'big.png', createdBy: null })).rejects.toBeInstanceOf(UploadError)
    expect(readdirSync(dir).length).toBe(before)
    expect(readdirSync(dir).some(name => name.endsWith('.part'))).toBe(false)
  })

  it('searches by tag, text and type with the query language, and deletes file and row', async () => {
    const team = await library.upload({ body: stream(PNG), filename: 'ada.png', folder: 'people', createdBy: null })
    const logo = await library.upload({ body: stream(PNG), filename: 'logo.png', createdBy: null })
    await library.update(team.id, { tags: ['team', 'portrait'], alt: { en: 'Ada at her desk' }, focal: { x: 0.8, y: 0.3 } })
    await library.update(logo.id, { tags: ['brand'], title: 'Our logo' })

    const ids = async (filter: Filter) => (await library.list({ filter })).items.map(i => i.id)
    expect(await ids({ tags: { contains: 'team' } })).toEqual([team.id])
    expect(await ids({ title: { contains: 'LOGO' } })).toEqual([logo.id])
    expect(await ids({ folder: { eq: 'people' } })).toEqual([team.id])
    expect((await library.list({ filter: { mime: { eq: 'image/png' } }, limit: 1 })).next).toEqual(expect.any(String))
    expect(await library.get(team.id)).toMatchObject({ alt: { en: 'Ada at her desk' }, focal: { x: 0.8, y: 0.3 } })

    expect(await library.delete(team.id)).toBe(true)
    expect(existsSync(join(dir, team.key))).toBe(false)
    expect(await library.get(team.id)).toBeUndefined()
  })
})
