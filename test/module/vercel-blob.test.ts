// The Vercel Blob driver against a stand-in for the SDK: what it asks of Vercel Blob, and how it reads back
import type { BlobSdk } from '../../packages/storage-vercel-blob/src/runtime/driver'
import { beforeEach, describe, expect, it } from 'vitest'
import { createVercelBlobDriver } from '../../packages/storage-vercel-blob/src/runtime/driver'

const blobs = new Map<string, { bytes: Uint8Array<ArrayBuffer>, contentType: string, access: string }>()
const calls: { op: string, key: string, options: Record<string, unknown> }[] = []

class BlobNotFoundError extends Error {}
const sdk = {
  BlobNotFoundError,
  async put(key: string, body: ReadableStream<Uint8Array>, options: { contentType: string, access: string }) {
    calls.push({ op: 'put', key, options })
    blobs.set(key, { bytes: new Uint8Array(await new Response(body).arrayBuffer()), contentType: options.contentType, access: options.access })
    return { url: `https://store.private.blob.vercel-storage.com/${key}`, pathname: key }
  },
  async get(key: string, options: Record<string, unknown>) {
    calls.push({ op: 'get', key, options })
    const blob = blobs.get(key)
    if (!blob)
      return null
    return { statusCode: 200, stream: new Response(blob.bytes).body, headers: new Headers(), blob: { size: blob.bytes.length } }
  },
  async head(key: string, options: Record<string, unknown>) {
    calls.push({ op: 'head', key, options })
    const blob = blobs.get(key)
    if (!blob)
      throw new BlobNotFoundError()
    return { size: blob.bytes.length }
  },
  async del(key: string, options: Record<string, unknown>) {
    calls.push({ op: 'del', key, options })
    blobs.delete(key)
  },
} as unknown as BlobSdk

describe('Vercel Blob storage driver', () => {
  const driver = createVercelBlobDriver({ token: 'vercel_blob_rw_test' }, sdk)
  beforeEach(() => {
    blobs.clear()
    calls.length = 0
  })

  it('stores files private, under their key, as multipart uploads', async () => {
    const data = new TextEncoder().encode('a picture')
    await driver.put('9f1c/photo.png', new Response(data).body!, { contentType: 'image/png' })
    expect(calls[0]).toEqual({ op: 'put', key: '9f1c/photo.png', options: { access: 'private', token: 'vercel_blob_rw_test', contentType: 'image/png', addRandomSuffix: false, allowOverwrite: true, multipart: true } })
    expect(await driver.head('9f1c/photo.png')).toEqual({ size: data.length })
    const stored = (await driver.get('9f1c/photo.png'))!
    expect([stored.size, await new Response(stored.stream).text()]).toEqual([data.length, 'a picture'])
    expect(calls.find(c => c.op === 'get')!.options).toMatchObject({ access: 'private', token: 'vercel_blob_rw_test' })
  })

  it('reads a missing file as none, and deletes', async () => {
    expect(await driver.get('nope/x.png')).toBeUndefined()
    expect(await driver.head('nope/x.png')).toBeUndefined()
    await driver.put('a/b.png', new Response('x').body!, { contentType: 'image/png' })
    await driver.delete('a/b.png')
    expect(blobs.has('a/b.png')).toBe(false)
  })
})
