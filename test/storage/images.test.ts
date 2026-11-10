// Image variants with sharp: focal-point crops, sizes, formats, kept in storage
import type { MediaItem } from '../../packages/core/src/runtime/server/media/library'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { cropBox, imageSize, variantFile, variantKey } from '../../packages/core/src/runtime/server/media/images'
import { createLocalDriver } from '../../packages/core/src/runtime/server/media/storage'

/** A 400×200 PNG: blue on the left, red in the right quarter, where the subject is. */
const photo = () => sharp({ create: { width: 400, height: 200, channels: 3, background: '#0000ff' } })
  .composite([{ input: { create: { width: 100, height: 200, channels: 3, background: '#ff0000' } }, left: 300, top: 0 }])
  .png().toBuffer()

const item = (key: string, focal: MediaItem['focal']): MediaItem => ({ id: key.split('/')[0]!, key, filename: 'photo.png', mime: 'image/png', size: 0, width: 400, height: 200, title: null, alt: null, caption: null, credits: null, folder: '', tags: [], focal, private: false, createdBy: null, createdAt: '', updatedAt: '' })

describe('image variants', () => {
  it('crops around the focal point, inside the image', () => {
    expect(cropBox(400, 200, 1, { x: 0.875, y: 0.5 })).toEqual({ left: 200, top: 0, width: 200, height: 200 }) // pushed back inside
    expect(cropBox(400, 200, 1, { x: 0.5, y: 0.5 })).toEqual({ left: 100, top: 0, width: 200, height: 200 })
    expect(cropBox(400, 200, 1)).toEqual({ left: 100, top: 0, width: 200, height: 200 })
    expect(cropBox(200, 400, 16 / 9, { x: 0.5, y: 0.1 })).toEqual({ left: 0, top: 0, width: 200, height: 113 })
  })

  it('keeps the focal point in a square crop of a wide image, and stores the variant once', async () => {
    const storage = createLocalDriver(mkdtempSync(join(tmpdir(), 'atelier-images-')))
    const original = item('img1/photo.png', { x: 0.9, y: 0.5 })
    await storage.put(original.key, new Response(await photo()).body!, { contentType: 'image/png' })
    expect(await imageSize(storage, original)).toEqual({ width: 400, height: 200 })

    const variant = { width: 320, aspect: '1:1' as const, format: 'webp' as const }
    const file = (await variantFile(storage, original, variant))!
    const bytes = new Uint8Array(await new Response(file.stream).arrayBuffer())
    const { info, data } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true })
    expect([info.width, info.height, (await sharp(bytes).metadata()).format]).toEqual([200, 200, 'webp']) // never enlarged
    // the right edge, where the subject is, is in the crop: red there
    const at = (x: number, y: number) => data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3)
    expect(at(190, 100)[0]).toBeGreaterThan(200)
    expect(at(10, 100)[2]).toBeGreaterThan(200) // blue on its left
    expect(await storage.head(variantKey(original, variant))).toEqual({ size: bytes.length }) // kept for the next request

    // without a focal point: the centre, so no red at all
    const centred = item('img2/photo.png', null)
    await storage.put(centred.key, new Response(await photo()).body!, { contentType: 'image/png' })
    const middle = await sharp(new Uint8Array(await new Response((await variantFile(storage, centred, { width: 320, aspect: '1:1' }))!.stream).arrayBuffer())).raw().toBuffer({ resolveWithObject: true })
    const offset = (100 * middle.info.width + 190) * middle.info.channels
    expect(middle.data[offset]).toBeLessThan(50) // red channel: blue there

    await storage.deletePrefix!('img1/')
    expect(await storage.head(original.key)).toBeUndefined()
    expect(await storage.head(variantKey(original, variant))).toBeUndefined()
  })
})
