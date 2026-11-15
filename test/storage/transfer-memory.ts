// Run by transfer-memory.test.ts, one phase per process (bun), so each starts with nothing held:
//   seed <dir> <rows>   an SQLite database with a large collection (source.sqlite)
//   export <dir>        exports it (export.ndjson)
//   import <dir>        imports that into a new database (target.sqlite)
//   buffer <dir>        reads the archive whole: the probe's calibration
//   upload <dir> <MB>   uploads a file that size to the media library (made as it's read: the source holds
//                       nothing), then downloads it, each measured
// Prints JSON: what the phase made, and `peak`, the most resident memory (after a collection, every 50 ms)
// it held above where it started.
import { statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { exportToFile, importFromFile } from '../../packages/core/src/cli/transfer'
import { buildTables } from '../../packages/core/src/runtime/server/db/tables'
import { createMediaLibrary } from '../../packages/core/src/runtime/server/media/library'
import { createLocalDriver } from '../../packages/core/src/runtime/server/media/storage'
import * as f from '../../packages/core/src/runtime/shared/fields'
import { connectEngine, createTables } from './env'

const [phase, dir, rows] = process.argv.slice(2) as [string, string, string | undefined]
const schema = { collections: { notes: { fields: { title: f.text(), body: f.textarea() } } }, singletons: {} }
const schemaFile = join(dir, 'schema.json')
const archive = join(dir, 'export.ndjson')

async function database(name: string, create: boolean) {
  const url = `file:${join(dir, name)}`
  const driver = await connectEngine(url)
  if (create)
    await createTables(driver, url, schemaFile)
  return driver
}
const notesOf = (driver: { dialect: string }) => (buildTables(driver.dialect as never, schema as never) as Record<string, unknown>).atelier_c_notes

// the heap counters miss strings Bun keeps outside its heap: resident memory doesn't
const resident = () => {
  Bun.gc(true)
  return process.memoryUsage().rss
}
async function peak(work: () => Promise<unknown>): Promise<number> {
  const start = resident()
  let most = start
  const timer = setInterval(() => most = Math.max(most, resident()), 50)
  try {
    await work()
  }
  finally {
    clearInterval(timer)
  }
  return Math.max(most, resident()) - start
}

if (phase === 'seed') {
  writeFileSync(schemaFile, JSON.stringify(schema))
  const source = await database('source.sqlite', true)
  const filler = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(90) // ~5 KB a row
  const total = Number(rows)
  for (let i = 0; i < total; i += 500) {
    const batch = Array.from({ length: Math.min(500, total - i) }, (_, j) => ({ _id: `n${i + j}`, _version: 1, _createdAt: new Date(), _updatedAt: new Date(), title: `Note ${i + j}`, body: `${i + j} ${filler}` }))
    await (source.db as any).insert(notesOf(source)).values(batch)
  }
  await source.close()
  console.log(JSON.stringify({ rows: total }))
}
else if (phase === 'export') {
  const source = await database('source.sqlite', false)
  const used = await peak(() => exportToFile(source, schema as never, archive))
  await source.close()
  console.log(JSON.stringify({ peak: used, archive: statSync(archive).size }))
}
else if (phase === 'import') {
  const target = await database('target.sqlite', true)
  const used = await peak(() => importFromFile(target, schema as never, archive))
  const count = ((await (target.db as any).select({ id: (notesOf(target) as any)._id }).from(notesOf(target))) as unknown[]).length
  await target.close()
  console.log(JSON.stringify({ peak: used, count }))
}
else if (phase === 'upload') {
  const size = Number(rows) * 1024 * 1024
  const driver = await database('media.sqlite', true)
  const library = createMediaLibrary(driver, createLocalDriver(join(dir, 'files')), { maxUploadSize: size + 1024 })
  const chunk = new Uint8Array(64 * 1024).fill(32)
  const head = new TextEncoder().encode('%PDF-1.7\n')
  let sent = 0
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= size)
        return controller.close()
      const part = sent === 0 ? new Uint8Array([...head, ...chunk.subarray(head.length)]) : chunk.subarray(0, Math.min(chunk.length, size - sent))
      sent += part.length
      controller.enqueue(part)
    },
  })
  let key = ''
  const uploaded = await peak(async () => key = (await library.upload({ body, filename: 'big.pdf', createdBy: null })).key)
  let received = 0
  const downloaded = await peak(async () => {
    const reader = (await library.storage.get(key))!.stream.getReader()
    for (let part = await reader.read(); !part.done; part = await reader.read())
      received += part.value.length
  })
  await driver.close()
  console.log(JSON.stringify({ uploaded, downloaded, size, received }))
}
else if (phase === 'buffer') {
  let whole = ''
  const used = await peak(async () => whole = await Bun.file(archive).text())
  console.log(JSON.stringify({ peak: used, length: whole.length }))
}
