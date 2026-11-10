// The S3 driver against MinIO (test/compose.yml): ATELIER_TEST_S3_URL=http://atelier:atelier-secret@127.0.0.1:59000/atelier
import { AwsClient } from 'aws4fetch'
import { beforeAll, describe, expect, it } from 'vitest'
import { createS3Driver } from '../../packages/storage-s3/src/runtime/driver'

const url = process.env.ATELIER_TEST_S3_URL

const bytes = (length: number) => Uint8Array.from({ length }, (_, i) => (i * 31 + 7) % 251)
const stream = (data: Uint8Array, chunk = 64 * 1024) => new ReadableStream<Uint8Array>({
  start(controller) {
    for (let i = 0; i < data.length; i += chunk)
      controller.enqueue(data.slice(i, i + chunk))
    controller.close()
  },
})

describe.skipIf(!url)('S3 storage driver (MinIO)', () => {
  const parsed = new URL(url ?? 'http://x:y@localhost/b')
  const driver = createS3Driver({
    endpoint: parsed.origin,
    bucket: parsed.pathname.slice(1),
    region: 'us-east-1',
    accessKeyId: decodeURIComponent(parsed.username),
    secretAccessKey: decodeURIComponent(parsed.password),
  })
  // the bucket, made when missing (a fresh MinIO has none)
  beforeAll(async () => {
    const client = new AwsClient({ accessKeyId: decodeURIComponent(parsed.username), secretAccessKey: decodeURIComponent(parsed.password), region: 'us-east-1', service: 's3' })
    for (let attempt = 0; attempt < 30; attempt++) {
      const response = await client.fetch(`${parsed.origin}${parsed.pathname}`, { method: 'PUT' }).catch(() => undefined)
      if (response && (response.ok || response.status === 409))
        return
      await new Promise(resolve => setTimeout(resolve, 1000)) // still starting
    }
    throw new Error(`Couldn't create the bucket at ${parsed.origin}${parsed.pathname}`)
  }, 180_000)
  const read = async (key: string) => new Uint8Array(await new Response((await driver.get(key))!.stream).arrayBuffer())

  it('stores, reads, sizes and deletes a small file in one request', async () => {
    const key = `test/${crypto.randomUUID()}/small file.png`
    const data = bytes(1000)
    await driver.put(key, stream(data), { contentType: 'image/png' })
    expect(await driver.head(key)).toEqual({ size: 1000 })
    expect(await read(key)).toEqual(data)
    await driver.delete(key)
    expect(await driver.get(key)).toBeUndefined()
    expect(await driver.head(key)).toBeUndefined()
    await driver.delete(key) // already gone: fine
  })

  it('streams a large file as a multipart upload, byte for byte', async () => {
    const key = `test/${crypto.randomUUID()}/big.bin`
    const data = bytes(12 * 1024 * 1024 + 123) // three parts, the last short
    await driver.put(key, stream(data), { contentType: 'application/octet-stream' })
    expect(await driver.head(key)).toEqual({ size: data.length })
    expect(await read(key)).toEqual(data)
    await driver.delete(key)
  }, 180_000)

  it('deletes everything under a prefix: an item\'s original and its variants', async () => {
    const id = crypto.randomUUID()
    for (const key of [`${id}/photo.png`, `${id}/variants/w320.webp`, `${id}/variants/w640-1x1.webp`])
      await driver.put(key, stream(bytes(100)), { contentType: 'image/png' })
    const other = `${crypto.randomUUID()}/keep.png`
    await driver.put(other, stream(bytes(10)), { contentType: 'image/png' })
    await driver.deletePrefix!(`${id}/`)
    expect(await driver.head(`${id}/photo.png`)).toBeUndefined()
    expect(await driver.head(`${id}/variants/w640-1x1.webp`)).toBeUndefined()
    expect(await driver.head(other)).toEqual({ size: 10 })
    await driver.delete(other)
  })

  it('keeps nothing from an upload whose stream fails', async () => {
    const key = `test/${crypto.randomUUID()}/broken.bin`
    let sent = 0
    const failing = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent >= 6 * 1024 * 1024)
          return controller.error(new Error('connection dropped'))
        controller.enqueue(bytes(1024 * 1024))
        sent += 1024 * 1024
      },
    })
    await expect(driver.put(key, failing, { contentType: 'application/octet-stream' })).rejects.toThrow('connection dropped')
    expect(await driver.head(key)).toBeUndefined()
  }, 180_000)
})
