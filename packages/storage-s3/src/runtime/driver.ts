// Media in S3-compatible object storage (AWS S3, Cloudflare R2, MinIO…), signed with aws4fetch: small and
// fetch-based, so it runs on edge runtimes too. A file of unknown length is streamed as a multipart upload
// in 5 MB parts, so at most one part is held in memory; a small one goes in a single PUT.
import type { StorageDriver } from 'nuxt-atelier/storage'
import { AwsClient } from 'aws4fetch'

export interface S3Options {
  /** The bucket's endpoint, path-style: `https://<account>.r2.cloudflarestorage.com`, `https://s3.<region>.amazonaws.com`. */
  endpoint: string
  bucket: string
  /** `auto` for R2. */
  region: string
  accessKeyId: string
  secretAccessKey: string
  /** Bytes per multipart part, at least 5 MB (S3's minimum). */
  partSize?: number
}

const PART = 5 * 1024 * 1024

export function createS3Driver(options: S3Options): StorageDriver {
  const client = new AwsClient({ accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey, region: options.region, service: 's3' })
  const base = `${options.endpoint.replace(/\/$/, '')}/${encodeURIComponent(options.bucket)}`
  const url = (key: string, query = '') => `${base}/${key.split('/').map(encodeURIComponent).join('/')}${query}`
  const partSize = Math.max(options.partSize ?? PART, PART)

  async function send(target: string, init: RequestInit & { body?: BodyInit | null }, ok = (status: number) => status >= 200 && status < 300): Promise<Response> {
    const response = await client.fetch(target, init)
    if (!ok(response.status))
      throw new Error(`S3 ${init.method ?? 'GET'} ${new URL(target).pathname} answered ${response.status}: ${(await response.text()).slice(0, 300)}`)
    return response
  }

  /** Fills `size` bytes from the reader (fewer at the end): the next part, and whether the stream ended. */
  async function nextPart(reader: ReadableStreamDefaultReader<Uint8Array>, carry: Uint8Array[]): Promise<{ part: Uint8Array<ArrayBuffer>, done: boolean }> {
    const chunks = carry.splice(0)
    let length = chunks.reduce((n, c) => n + c.length, 0)
    let done = false
    while (length < partSize) {
      const next = await reader.read()
      if (next.done) {
        done = true
        break
      }
      chunks.push(next.value)
      length += next.value.length
    }
    const part = new Uint8Array(Math.min(length, partSize))
    let offset = 0
    for (const chunk of chunks) {
      const room = part.length - offset
      if (chunk.length <= room) {
        part.set(chunk, offset)
        offset += chunk.length
      }
      else {
        part.set(chunk.subarray(0, room), offset)
        carry.push(chunk.subarray(room))
        offset += room
      }
    }
    return { part, done: done && !carry.length }
  }

  return {
    name: 's3',
    async put(key, body, info) {
      const reader = body.getReader()
      const carry: Uint8Array[] = []
      const first = await nextPart(reader, carry)
      if (first.done) // it fits in one request
        return void await send(url(key), { method: 'PUT', body: first.part, headers: { 'content-type': info.contentType } })

      const created = await (await send(url(key, '?uploads'), { method: 'POST', headers: { 'content-type': info.contentType } })).text()
      const uploadId = /<UploadId>([^<]+)<\/UploadId>/.exec(created)?.[1]
      if (!uploadId)
        throw new Error('S3 didn\'t start the multipart upload')
      const etags: string[] = []
      try {
        let part = first
        for (let n = 1; ; n++) {
          const response = await send(url(key, `?partNumber=${n}&uploadId=${encodeURIComponent(uploadId)}`), { method: 'PUT', body: part.part })
          etags.push(response.headers.get('etag')!)
          if (part.done)
            break
          part = await nextPart(reader, carry)
          if (!part.part.length)
            break
        }
        const parts = etags.map((etag, i) => `<Part><PartNumber>${i + 1}</PartNumber><ETag>${etag}</ETag></Part>`).join('')
        await send(url(key, `?uploadId=${encodeURIComponent(uploadId)}`), { method: 'POST', body: `<CompleteMultipartUpload>${parts}</CompleteMultipartUpload>`, headers: { 'content-type': 'application/xml' } })
      }
      catch (error) {
        await reader.cancel().catch(() => {})
        await client.fetch(url(key, `?uploadId=${encodeURIComponent(uploadId)}`), { method: 'DELETE' }).catch(() => {}) // the parts aren't kept
        throw error
      }
    },
    async get(key) {
      const response = await send(url(key), { method: 'GET' }, s => (s >= 200 && s < 300) || s === 404)
      if (response.status === 404 || !response.body)
        return undefined
      return { stream: response.body, size: Number(response.headers.get('content-length') ?? 0) }
    },
    async head(key) {
      const response = await send(url(key), { method: 'HEAD' }, s => (s >= 200 && s < 300) || s === 404)
      return response.status === 404 ? undefined : { size: Number(response.headers.get('content-length') ?? 0) }
    },
    async delete(key) {
      await send(url(key), { method: 'DELETE' }, s => (s >= 200 && s < 300) || s === 404)
    },
    async deletePrefix(prefix) {
      for (let token: string | undefined, page = 0; page < 100; page++) {
        const list = await (await send(`${base}?list-type=2&prefix=${encodeURIComponent(prefix)}${token ? `&continuation-token=${encodeURIComponent(token)}` : ''}`, { method: 'GET' })).text()
        const keys = [...list.matchAll(/<Key>([^<]+)<\/Key>/g)].map(m => m[1]!.replaceAll('&amp;', '&'))
        for (const key of keys)
          await this.delete(key)
        token = /<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(list)?.[1]
        if (!token)
          return
      }
    },
  }
}
