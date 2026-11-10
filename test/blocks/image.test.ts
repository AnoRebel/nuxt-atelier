import { describe, expect, it } from 'vitest'
import { imageAttributes } from '../../packages/core/src/runtime/app/media'

const photo = { id: 'm1', url: '/_atelier/media/m1/team.jpg', filename: 'team.jpg', mime: 'image/jpeg', width: 1600, height: 900, title: null, alt: { 'en': 'The team', 'et': 'Meeskond', '': 'Team' }, caption: null, credits: null, focal: null }
const widths = [320, 640, 960, 1280, 1920, 2560]

describe('responsive image markup', () => {
  it('sizes the image so nothing shifts, offering variants up to its own width', () => {
    expect(imageAttributes(photo, { sizes: '(min-width: 768px) 50vw, 100vw', locale: 'et' }, widths)).toMatchInlineSnapshot(`
      {
        "alt": "Meeskond",
        "height": 900,
        "sizes": "(min-width: 768px) 50vw, 100vw",
        "src": "/_atelier/media/m1/team.jpg?w=1280",
        "srcset": "/_atelier/media/m1/team.jpg?w=320 320w, /_atelier/media/m1/team.jpg?w=640 640w, /_atelier/media/m1/team.jpg?w=960 960w, /_atelier/media/m1/team.jpg?w=1280 1280w, /_atelier/media/m1/team.jpg?w=1920 1600w",
        "width": 1600,
      }
    `)
  })

  it('takes the cropped size for a ratio, and a format', () => {
    const square = imageAttributes(photo, { ratio: '1:1', format: 'webp' }, widths)
    expect([square.width, square.height, square.alt]).toEqual([900, 900, 'Team'])
    expect(square.srcset).toBe('/_atelier/media/m1/team.jpg?w=320&ar=1:1&format=webp 320w, /_atelier/media/m1/team.jpg?w=640&ar=1:1&format=webp 640w, /_atelier/media/m1/team.jpg?w=960&ar=1:1&format=webp 900w')
  })

  it('falls back to the file itself for what can\'t be resized', () => {
    expect(imageAttributes({ ...photo, mime: 'image/gif' }, {}, widths)).toEqual({ src: photo.url, alt: 'Team', width: 1600, height: 900 })
    expect(imageAttributes({ ...photo, width: null, height: null, alt: null }, { alt: 'Given' }, widths)).toEqual({ src: photo.url, alt: 'Given' })
  })

  it('hands the variants to an image service when one is configured', () => {
    const cloudflare = { template: '/cdn-cgi/image/width={w},height={h},fit=cover,gravity={fx}x{fy},format=auto/{src}', site: 'https://example.com' }
    const attrs = imageAttributes({ ...photo, focal: { x: 0.8, y: 0.25 } }, { ratio: '1:1' }, [320, 640, 1280], cloudflare)
    expect(attrs.srcset).toBe([
      '/cdn-cgi/image/width=320,height=320,fit=cover,gravity=0.80x0.25,format=auto/https://example.com/_atelier/media/m1/team.jpg 320w',
      '/cdn-cgi/image/width=640,height=640,fit=cover,gravity=0.80x0.25,format=auto/https://example.com/_atelier/media/m1/team.jpg 640w',
      '/cdn-cgi/image/width=900,height=900,fit=cover,gravity=0.80x0.25,format=auto/https://example.com/_atelier/media/m1/team.jpg 900w',
    ].join(', '))
    expect([attrs.width, attrs.height]).toEqual([900, 900])
  })
})
