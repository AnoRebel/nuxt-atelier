import { describe, expect, it } from 'vitest'
import type { ContentSchema } from '../../packages/core/src/runtime/server/db/tables'
import { buildTables } from '../../packages/core/src/runtime/server/db/tables'
import * as f from '../../packages/core/src/runtime/shared/fields'

const authors = { fields: { name: f.text() } }
const build = (collections: ContentSchema['collections'], singletons: ContentSchema['singletons'] = {}) =>
  () => buildTables('sqlite', { collections: { authors, ...collections }, singletons })

describe('schema checks', () => {
  it('refuses a relation to something that isn\'t a collection', () => {
    expect(build({ posts: { fields: { tag: f.relation({ to: 'tags' }) } } }))
      .toThrow('posts: relation "tag" points to "tags", which isn\'t a collection')
  })

  it('refuses cascading deletes from a singleton', () => {
    expect(build({}, { settings: { fields: { editor: f.relation({ to: 'authors', onDelete: 'cascade' }) } } }))
      .toThrow('settings: relation "editor" can\'t cascade deletes')
  })

  it('refuses renamedFrom on nested fields and on names in use', () => {
    expect(build({ posts: { fields: { faq: f.repeater({ fields: { q: f.text({ renamedFrom: 'question' }) } }) } } }))
      .toThrow('posts.faq: field "q" can\'t declare renamedFrom')
    expect(build({ posts: { fields: { title: f.text(), heading: f.text({ renamedFrom: 'title' }) } } }))
      .toThrow('which must be a valid field key that no other field uses')
    expect(build({ posts: { renamedFrom: 'authors', fields: {} } }))
      .toThrow('Collection "posts" is renamedFrom "authors"')
  })
})
