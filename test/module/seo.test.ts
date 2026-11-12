import { describe, expect, it } from 'vitest'
import { resolveSeo } from '../../packages/core/src/runtime/shared/seo'

describe('page metadata', () => {
  const page = { path: '/blog/hello', siteUrl: 'https://example.com/' }

  it('falls back to the entry\'s own fields and the page\'s URL', () => {
    expect(resolveSeo({ data: { title: 'Hello', excerpt: 'A first post', cover: 'm1' }, media: { m1: { url: '/_atelier/media/m1/a.jpg' } } }, page)).toEqual({
      title: 'Hello',
      description: 'A first post',
      image: 'https://example.com/_atelier/media/m1/a.jpg',
      canonical: 'https://example.com/blog/hello',
    })
    expect(resolveSeo({ data: { name: 'Ada' } }, { path: '/team/ada' })).toEqual({ title: 'Ada', canonical: '/team/ada' })
  })

  it('takes the seo field\'s values first, and its robots directives', () => {
    const data = { title: 'Hello', description: 'Long', seo: { title: 'Hi there', description: '  ', canonical: 'https://other.example/x', noindex: true, nofollow: false } }
    expect(resolveSeo({ data }, page)).toEqual({ title: 'Hi there', description: 'Long', canonical: 'https://other.example/x', robots: 'noindex' })
  })
})
