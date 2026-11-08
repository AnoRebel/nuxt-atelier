import { Validator } from '@seriousme/openapi-schema-validator'
import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { openApiDocument } from '../../packages/core/src/runtime/server/openapi'
import * as f from '../../packages/core/src/runtime/shared/fields'

const geoPoint = f.defineFieldType({ name: 'geo-point', storage: 'json', schema: v.object({ lat: v.number(), lng: v.number() }) })

const schema = {
  collections: {
    'blog-posts': {
      fields: {
        title: f.text({ required: true, maxLength: 120, pattern: '[A-Z].*', label: 'Title', help: 'Starts with a capital' }),
        slug: f.slug({ unique: true }),
        summary: f.textarea(),
        body: f.richText(),
        views: f.number({ integer: true, min: 0 }),
        rating: f.number({ max: 5 }),
        live: f.boolean(),
        status: f.select({ options: ['draft', { value: 'published', label: 'Published' }] }),
        tags: f.multiSelect({ options: ['vue', 'nuxt'], maxItems: 3 }),
        publishedAt: f.date({ mode: 'datetime' }),
        contact: f.email(),
        website: f.url(),
        accent: f.color({ alpha: true }),
        meta: f.json(),
        cover: f.media(),
        author: f.relation({ to: 'authors' }),
        related: f.relation({ to: 'blog-posts', many: true }),
        seo: f.object({ fields: { title: f.text() } }),
        faq: f.repeater({ fields: { q: f.text({ required: true }), a: f.richText() } }),
        content: f.blocks(),
        location: geoPoint(),
      },
    },
    'authors': { fields: { name: f.text({ required: true }) } },
  },
  singletons: { settings: { fields: { siteName: f.text({ required: true }) } } },
}

describe('openApiDocument()', () => {
  it('is a valid OpenAPI 3.1 document with every collection, singleton and field type', async () => {
    const document = openApiDocument(schema)
    const result = await new Validator().validate(document as never)
    expect(result.errors).toBeUndefined()
    expect(result.valid).toBe(true)
    // the validator does reject a broken document
    expect((await new Validator().validate({ ...document, info: undefined } as never)).valid).toBe(false)

    const paths = Object.keys(document.paths as object)
    for (const path of ['/api/_atelier/collections/blog-posts', '/api/_atelier/collections/blog-posts/{id}', '/api/_atelier/collections/authors', '/api/_atelier/singletons/settings'])
      expect(paths).toContain(path)
    const data = (document.components as { schemas: Record<string, { properties: Record<string, Record<string, any>>, required: string[] }> }).schemas.BlogPostsData!
    expect(data.required).toEqual(['title'])
    expect(data.properties.title).toMatchObject({ type: 'string', maxLength: 120, title: 'Title' })
    expect(data.properties.status.anyOf[0]).toEqual({ type: 'string', enum: ['draft', 'published'] })
    expect(data.properties.slug.anyOf[0]).toMatchObject({ maxLength: 255 })
    expect(data.properties.faq.anyOf[0].items.required).toEqual(['q'])
    expect(data.properties.location.anyOf[0]).toEqual({ 'x-atelier-field-type': 'geo-point' })
  })
})
