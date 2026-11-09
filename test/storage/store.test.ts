import type { AtelierDriver } from '../../packages/core/src/runtime/server/db/driver'
import type { EntryStore } from '../../packages/core/src/runtime/server/db/store'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { UnsupportedOperationError } from '../../packages/core/src/runtime/server/db/driver'
import { ConflictError, createEntryStore, NotFoundError, ReferencedError, ValidationError, withTransaction } from '../../packages/core/src/runtime/server/db/store'
import * as f from '../../packages/core/src/runtime/shared/fields'
import { connectEngine, createTables, engines, query, resetDatabase } from './env'

const schema = {
  collections: {
    articles: {
      fields: {
        title: f.text({ required: true, unique: true }),
        tags: f.relation({ to: 'tags', many: true, onDelete: 'nullify' }),
        author: f.relation({ to: 'authors' }), // restrict
        faq: f.repeater({ fields: { q: f.text(), who: f.relation({ to: 'authors', onDelete: 'nullify' }) } }),
      },
    },
    authors: { fields: { name: f.text(), mentor: f.relation({ to: 'authors' }) } },
    tags: { fields: { name: f.text() } },
    comments: { fields: { text: f.text(), article: f.relation({ to: 'articles', onDelete: 'cascade' }) } },
    // two-way relations: many ↔ many, one ↔ many, and a symmetric one on a single collection
    books: { fields: { title: f.text(), writers: f.relation({ to: 'writers', many: true, inverse: 'books' }), chapters: f.relation({ to: 'chapters', many: true, inverse: 'book' }) } },
    writers: { fields: { name: f.text(), books: f.relation({ to: 'books', many: true, inverse: 'writers' }) } },
    chapters: { fields: { title: f.text(), book: f.relation({ to: 'books', inverse: 'chapters' }) } },
    people: { fields: { name: f.text(), friends: f.relation({ to: 'people', many: true, inverse: 'friends' }) } },
    // routable: a shared pattern and one per locale
    pages: { route: { pattern: '/{slug}' }, fields: { slug: f.slug({ required: true }) } },
    places: { route: { pattern: { en: '/places/{slug}', et: '/kohad/{slug}' } }, fields: { slug: f.slug({ required: true }), near: f.relation({ to: 'places' }) } },
    sections: { route: { pattern: '/{slug}', parent: 'parent' }, fields: { slug: f.slug({ required: true }), parent: f.relation({ to: 'sections' }) } },
    // drafts and publishing
    posts: { versioned: true, route: { pattern: '/posts/{slug}' }, fields: { slug: f.slug({ required: true }), title: f.text({ unique: true }), tag: f.relation({ to: 'tags' }) } },
  },
  singletons: {
    banner: { versioned: true, fields: { text: f.text() } },
    settings: { fields: { siteName: f.text({ required: true }), editor: f.relation({ to: 'authors', onDelete: 'nullify' }) } },
  },
}
const schemaFile = join(mkdtempSync(join(tmpdir(), 'atelier-store-')), 'schema.json')
writeFileSync(schemaFile, JSON.stringify(schema))

describe.each(engines)('%s entry store', (_, url) => {
  let driver: AtelierDriver
  let store: EntryStore
  const relationsOf = async (id: string) => (await query(driver, sql`select field, position, target, target_id from atelier_relations where source_id = ${id} order by field, position`))
    .map(r => `${r.field}[${r.position}] → ${r.target}/${r.target_id}`)

  beforeAll(async () => {
    driver = await connectEngine(url)
    await resetDatabase(driver)
    await createTables(driver, url, schemaFile)
    store = createEntryStore(driver, schema)
  }, 120_000)
  afterAll(() => driver?.close())

  it('creates an entry with its relations and a first revision', async () => {
    const entry = await store.save('articles', { data: { title: 'Hello', tags: ['t1', 't2'], author: 'a1', faq: [{ q: 'Why?', who: 'a2' }] } })
    expect(entry).toMatchObject({ version: 1, data: { title: 'Hello', tags: ['t1', 't2'], author: 'a1', faq: [{ q: 'Why?', who: 'a2' }] } })
    expect(await relationsOf(entry.id)).toEqual(['author[0] → authors/a1', 'faq.0.who[0] → authors/a2', 'tags[0] → tags/t1', 'tags[1] → tags/t2'])
    expect((await store.revisions('articles', entry.id)).map(r => r.version)).toEqual([1])
  })

  it('updates against the version it read, replacing relations', async () => {
    const created = await store.save('articles', { data: { title: 'Draft', tags: ['t1'] } })
    const updated = await store.save('articles', { id: created.id, version: 1, data: { title: 'Final', tags: ['t3'] } })
    expect(updated).toMatchObject({ version: 2, data: { title: 'Final', tags: ['t3'], author: null } })
    expect(await relationsOf(created.id)).toEqual(['tags[0] → tags/t3'])
    expect((await store.revisions('articles', created.id)).map(r => [r.version, r.data.title])).toEqual([[2, 'Final'], [1, 'Draft']])
  })

  it('refuses a stale save with 409 and the current version, keeping the newer data', async () => {
    const { id } = await store.save('articles', { data: { title: 'Shared' } })
    await store.save('articles', { id, version: 1, data: { title: 'First save wins' } })
    const stale = store.save('articles', { id, version: 1, data: { title: 'Second save' } })
    await expect(stale).rejects.toBeInstanceOf(ConflictError)
    await expect(stale).rejects.toMatchObject({ statusCode: 409, data: { currentVersion: 2 } })
    expect((await store.get('articles', id))!.data.title).toBe('First save wins')
  })

  it('lets exactly one of two concurrent saves of the same version through', async () => {
    const { id } = await store.save('articles', { data: { title: 'Race' } })
    const results = await Promise.allSettled([
      store.save('articles', { id, version: 1, data: { title: 'Race A' } }),
      store.save('articles', { id, version: 1, data: { title: 'Race B' } }),
    ])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect((await store.get('articles', id))!.version).toBe(2)
  })

  it('leaves no partial data when a save fails after writing some rows', async () => {
    const { id } = await store.save('articles', { data: { title: 'Before', tags: ['t1'] } })
    // a revision already holding version 2 makes the save fail on its last write, after the entry and relations
    await query(driver, sql`insert into atelier_revisions (_id, source, source_id, _version, data, _created_at, published) values ('blocker', 'articles', ${id}, 2, '{}', 'now', ${false})`)
    await expect(store.save('articles', { id, version: 1, data: { title: 'After', tags: ['t9'] } })).rejects.toThrow()
    expect(await store.get('articles', id)).toMatchObject({ version: 1, data: { title: 'Before', tags: ['t1'] } })
    expect(await relationsOf(id)).toEqual(['tags[0] → tags/t1'])
  })

  it('writes nothing for invalid data, with field errors (422)', async () => {
    await expect(store.save('articles', { data: { title: '' } })).rejects.toMatchObject({
      statusCode: 422,
      errors: [{ path: 'title', message: 'required' }],
    })
    const duplicate = store.save('articles', { data: { title: 'Hello' } })
    await expect(duplicate).rejects.toBeInstanceOf(ValidationError)
    await expect(duplicate).rejects.toMatchObject({ errors: [{ path: 'title', message: 'already used by another entry' }] })
  })

  it('runs a transaction, or refuses it on D1 with the limitation named and nothing changed', async () => {
    const { id } = await store.save('articles', { data: { title: 'Untouched' } })
    const rename = withTransaction(driver, 'Renaming entries', async (tx) => {
      const statement = sql`update atelier_c_articles set title = 'Renamed' where _id = ${id}`
      await (driver.dialect === 'sqlite' ? tx.run(statement) : tx.execute(statement))
    })
    if (driver.capabilities.transactions) {
      await rename
      expect((await store.get('articles', id, { stage: 'draft' }))!.data.title).toBe('Renamed')
    }
    else {
      await expect(rename).rejects.toBeInstanceOf(UnsupportedOperationError)
      await expect(rename).rejects.toThrow('Renaming entries needs a multi-statement transaction, which Cloudflare D1 doesn\'t support. Nothing was changed.')
      expect((await store.get('articles', id))!.data.title).toBe('Untouched')
    }
  })

  it('saves a singleton: first save, update, and a stale save refused', async () => {
    expect(await store.getSingleton('settings')).toBeUndefined()
    const first = await store.saveSingleton('settings', { version: null, data: { siteName: 'Atelier', editor: 'a1' } })
    expect(first).toMatchObject({ version: 1, data: { siteName: 'Atelier', editor: 'a1' } })
    expect(await relationsOf('settings')).toEqual(['editor[0] → authors/a1'])
    expect(await store.saveSingleton('settings', { version: 1, data: { siteName: 'Atelier CMS' } })).toMatchObject({ version: 2 })
    await expect(store.saveSingleton('settings', { version: 1, data: { siteName: 'Stale' } })).rejects.toMatchObject({ statusCode: 409, data: { currentVersion: 2 } })
    // a second "first save" lost the race too
    await expect(store.saveSingleton('settings', { version: null, data: { siteName: 'Also first' } })).rejects.toMatchObject({ statusCode: 409 })
    expect((await store.revisions('settings')).map(r => r.version)).toEqual([2, 1])
    expect((await store.getSingleton('settings'))!.data.siteName).toBe('Atelier CMS')
  })

  it('refuses to delete an entry a restricting relation points to, listing the references', async () => {
    const author = await store.save('authors', { data: { name: 'Ada' } })
    const article = await store.save('articles', { data: { title: 'By Ada', author: author.id } })
    const refused = store.delete('authors', author.id)
    await expect(refused).rejects.toBeInstanceOf(ReferencedError)
    await expect(refused).rejects.toMatchObject({ statusCode: 409, data: { references: [{ collection: 'articles', id: article.id, field: 'author' }] } })
    expect(await store.get('authors', author.id)).toBeDefined()
    // a reference from the entry itself doesn't block it
    const self = await store.save('authors', { data: { name: 'Self' } })
    await store.save('authors', { id: self.id, version: 1, data: { name: 'Self', mentor: self.id } })
    await store.delete('authors', self.id)
    expect(await store.get('authors', self.id)).toBeUndefined()
  })

  it('nullifies references, with a new version of each entry holding one', async () => {
    const [t1, t2] = [await store.save('tags', { data: { name: 'one' } }), await store.save('tags', { data: { name: 'two' } })]
    const who = await store.save('authors', { data: { name: 'Grace' } })
    const article = await store.save('articles', { data: { title: 'Tagged', tags: [t1.id, t2.id], faq: [{ q: 'Who?', who: who.id }] } })
    await store.saveSingleton('settings', { version: (await store.getSingleton('settings'))?.version ?? null, data: { siteName: 'Site', editor: who.id } })

    await store.delete('tags', t1.id)
    expect(await store.get('articles', article.id)).toMatchObject({ version: 2, data: { tags: [t2.id] } })
    await store.delete('authors', who.id)
    expect(await store.get('articles', article.id)).toMatchObject({ version: 3, data: { tags: [t2.id], faq: [{ q: 'Who?', who: null }] } })
    expect(await relationsOf(article.id)).toEqual([`tags[0] → tags/${t2.id}`])
    expect((await store.getSingleton('settings'))!.data.editor).toBeNull()
  })

  it('cascades a delete to the entries that depend on it, atomically', async () => {
    const article = await store.save('articles', { data: { title: 'With comments' } })
    const comments = [
      await store.save('comments', { data: { text: 'First', article: article.id } }),
      await store.save('comments', { data: { text: 'Second', article: article.id } }),
    ]
    await store.delete('articles', article.id)
    expect(await store.get('articles', article.id)).toBeUndefined()
    for (const comment of comments) {
      expect(await store.get('comments', comment.id)).toBeUndefined()
      expect(await relationsOf(comment.id)).toEqual([])
    }

    // a restricting reference to a cascaded entry refuses the whole delete
    const author = await store.save('authors', { data: { name: 'Linus' } })
    const kept = await store.save('articles', { data: { title: 'Kept', author: author.id } })
    const comment = await store.save('comments', { data: { text: 'Stays', article: kept.id } })
    await store.save('articles', { data: { title: 'Points at the comment\'s article', author: author.id } })
    await expect(store.delete('authors', author.id)).rejects.toBeInstanceOf(ReferencedError)
    expect(await store.get('comments', comment.id)).toBeDefined()
    await expect(store.delete('articles', 'missing')).rejects.toBeInstanceOf(NotFoundError)
  })

  it('keeps both sides of a two-way relation in sync, whichever side is edited', async () => {
    const [w1, w2] = [await store.save('writers', { data: { name: 'Ann' } }), await store.save('writers', { data: { name: 'Bo' } })]
    const book = await store.save('books', { data: { title: 'Duet', writers: [w1.id, w2.id] } })
    expect(await store.get('writers', w1.id)).toMatchObject({ version: 2, data: { books: [book.id] } })
    expect(await store.get('writers', w2.id)).toMatchObject({ version: 2, data: { books: [book.id] } })

    // from the other side; a stale save of that side is refused
    await store.save('writers', { id: w1.id, version: 2, data: { name: 'Ann', books: [] } })
    expect((await store.get('books', book.id))!.data.writers).toEqual([w2.id])
    await expect(store.save('writers', { id: w2.id, version: 1, data: { name: 'Bo' } })).rejects.toBeInstanceOf(ConflictError)
  })

  it('moves a link when the inverse side holds one entry', async () => {
    const [b1, b2] = [await store.save('books', { data: { title: 'One' } }), await store.save('books', { data: { title: 'Two' } })]
    const chapter = await store.save('chapters', { data: { title: 'Intro', book: b1.id } })
    expect((await store.get('books', b1.id))!.data.chapters).toEqual([chapter.id])

    await store.save('books', { id: b2.id, version: 1, data: { title: 'Two', chapters: [chapter.id] } })
    expect((await store.get('chapters', chapter.id))!.data.book).toBe(b2.id)
    expect((await store.get('books', b1.id))!.data.chapters).toEqual([])
  })

  it('unlinks the other side when an entry of a two-way relation is deleted, and syncs a symmetric relation', async () => {
    const writer = await store.save('writers', { data: { name: 'Cy' } })
    const book = await store.save('books', { data: { title: 'Gone', writers: [writer.id] } })
    await store.delete('books', book.id) // no onDelete: the inverse side is unlinked, not restricted
    expect(await store.get('writers', writer.id)).toMatchObject({ version: 3, data: { books: [] } })

    const [p1, p2] = [await store.save('people', { data: { name: 'Di' } }), await store.save('people', { data: { name: 'Ed' } })]
    await store.save('people', { id: p1.id, version: 1, data: { name: 'Di', friends: [p2.id, p1.id] } })
    expect((await store.get('people', p2.id))!.data.friends).toEqual([p1.id])
    expect((await store.get('people', p1.id))!.data.friends).toEqual([p2.id, p1.id]) // a link to itself has no other side
  })

  it('populates relations to the depth asked', async () => {
    const mentor = await store.save('authors', { data: { name: 'Mentor' } })
    const author = await store.save('authors', { data: { name: 'Mentee', mentor: mentor.id } })
    const article = await store.save('articles', { data: { title: 'Populated', author: author.id, tags: ['gone'], faq: [{ q: 'Q', who: mentor.id }] } })

    expect((await store.get('articles', article.id))!.data.author).toBe(author.id)
    const one = (await store.get('articles', article.id, { depth: 1 }))!.data
    expect(one).toMatchObject({ author: { id: author.id, data: { name: 'Mentee', mentor: mentor.id } }, tags: [], faq: [{ who: { data: { name: 'Mentor' } } }] })
    const two = (await store.get('articles', article.id, { depth: 2 }))!.data
    expect(two).toMatchObject({ author: { data: { mentor: { id: mentor.id, data: { name: 'Mentor' } } } } })
  })

  it('stores routable entries\' paths, resolves them, refuses taken ones and drops them on delete', async () => {
    const page = await store.save('pages', { data: { slug: 'about' } })
    expect(page.path).toBe('/about')
    const place = await store.save('places', { data: { slug: 'harbour' } })
    expect(place).toMatchObject({ path: '/places/harbour', paths: { en: '/places/harbour', et: '/kohad/harbour' } })
    expect(await store.resolve('/kohad/harbour', 'et')).toEqual({ path: '/kohad/harbour', locale: 'et', kind: 'collection', name: 'places', id: place.id })
    expect(await store.resolve('/kohad/harbour', 'en')).toBeUndefined()
    // related entries carry their path too
    const near = await store.save('places', { data: { slug: 'pier', near: place.id } })
    expect((await store.get('places', near.id, { depth: 1 }))!.data.near).toMatchObject({ path: '/places/harbour' })

    const taken = await store.save('pages', { data: { slug: 'about' } }).catch(e => e)
    expect(taken).toBeInstanceOf(ValidationError)
    expect(taken.errors).toEqual([{ path: 'slug', message: `The URL /about is already used by entry "${page.id}" in "pages"` }])

    const moved = await store.save('pages', { id: page.id, version: 1, data: { slug: 'about-us' } })
    expect(moved.path).toBe('/about-us')
    expect(await store.resolve('/about')).toBeUndefined()
    expect((await store.save('pages', { data: { slug: 'about' } })).path).toBe('/about') // free again

    await store.delete('pages', page.id)
    expect(await store.resolve('/about-us')).toBeUndefined()
  })

  it('nests URLs under the parent\'s and moves every entry below when a parent\'s URL changes', async () => {
    const services = await store.save('sections', { data: { slug: 'services' } })
    const design = await store.save('sections', { data: { slug: 'design', parent: services.id } })
    const ux = await store.save('sections', { data: { slug: 'ux', parent: design.id } })
    expect([design.path, ux.path]).toEqual(['/services/design', '/services/design/ux'])

    await store.save('sections', { id: services.id, version: 1, data: { slug: 'what-we-do' } })
    expect((await store.get('sections', design.id))!.path).toBe('/what-we-do/design')
    expect((await store.get('sections', ux.id))!).toMatchObject({ path: '/what-we-do/design/ux', version: 1 }) // a path change isn't a new version
    expect(await store.resolve('/services/design/ux')).toBeUndefined()
    expect((await store.resolve('/what-we-do/design/ux'))!.id).toBe(ux.id)

    // moving a branch: refused when an entry below it would land on a taken URL
    const place = await store.save('places', { data: { slug: 'ux' } }) // /places/ux in English
    const refused = await store.save('sections', { id: design.id, version: 1, data: { slug: 'places' } }).catch(e => e)
    expect(refused).toBeInstanceOf(ValidationError)
    expect(refused.errors).toEqual([{ path: 'slug', message: `The URL of entry "${ux.id}", below this one, /places/ux is already used by entry "${place.id}" in "places"` }])
    const moved = await store.save('sections', { id: design.id, version: 1, data: { slug: 'studio' } }) // to the top level
    expect(moved.path).toBe('/studio')
    expect((await store.get('sections', ux.id))!.path).toBe('/studio/ux')

    // an entry can't sit under itself or anything below it
    await store.save('sections', { id: design.id, version: 2, data: { slug: 'design', parent: services.id } })
    const cycle = await store.save('sections', { id: services.id, version: 2, data: { slug: 'what-we-do', parent: ux.id } }).catch(e => e)
    expect(cycle.errors).toEqual([{ path: 'parent', message: 'An entry can\'t be placed under itself or an entry below it' }])
  })

  it('redirects a changed URL to the new one without chains, and lets an entry take a URL back', async () => {
    const list = async () => (await store.redirects.list()).map(r => `${r.source} → ${r.target} ${r.status}${r.auto ? ' auto' : ''}`)
    for (const r of await store.redirects.list())
      await store.redirects.delete(r.id) // from earlier tests
    const page = await store.save('pages', { data: { slug: 'one' } })
    await store.save('pages', { id: page.id, version: 1, data: { slug: 'two' } })
    await store.save('pages', { id: page.id, version: 2, data: { slug: 'three' } })
    expect(await list()).toEqual(['/one → /three 301 auto', '/two → /three 301 auto']) // re-pointed, not chained
    await store.save('pages', { id: page.id, version: 3, data: { slug: 'one' } }) // back: the entry's URL wins
    expect((await list()).toSorted()).toEqual(['/three → /one 301 auto', '/two → /one 301 auto'])

    // manual redirects: checked, and loops refused
    const manual = await store.redirects.save({ source: '/old/:x', target: '/new/:x', status: 308 })
    expect(manual).toMatchObject({ source: '/old/:x', target: '/new/:x', status: 308, auto: false })
    const loop = await store.redirects.save({ source: '/new/:x', target: '/old/:x' }).catch(e => e)
    expect(loop.errors).toEqual([{ path: 'target', message: 'This would make a loop: /new/x → /old/x → /new/x' }])
    expect((await store.redirects.save({ source: '/one', target: '/elsewhere' }).catch(e => e)).errors[0].message).toMatch(/^\/one is the URL of entry/)
    expect((await store.redirects.save({ source: '/two', target: '/x' }).catch(e => e)).errors[0].message).toBe('/two already redirects to /one')
    expect((await store.redirects.save({ source: '//x', target: '//evil.example', status: 303 }).catch(e => e)).errors.map((e: { path: string }) => e.path)).toEqual(['source', 'status'])
    await store.redirects.delete(manual.id)
    expect(await store.redirects.cached()).toHaveLength(2)
  })

  it('keeps drafts off the site until published, then serves the published version while the next draft is edited', async () => {
    const draft = await store.save('posts', { data: { slug: 'first', title: 'First', tag: 't1' } })
    expect(draft).toMatchObject({ version: 1, publishedVersion: null, path: '/posts/first' })
    expect(await store.get('posts', draft.id)).toBeUndefined()
    expect((await store.list('posts', {})).items).toEqual([])
    expect(await store.resolve('/posts/first')).toBeUndefined()
    expect(await store.resolve('/posts/first', undefined, 'draft')).toMatchObject({ id: draft.id })

    await expect(store.publish('posts', draft.id, { version: 0 })).rejects.toBeInstanceOf(ConflictError)
    const live = await store.publish('posts', draft.id, { version: 1 })
    expect(live).toMatchObject({ version: 2, publishedVersion: 2 })
    expect(await store.get('posts', draft.id)).toMatchObject({ version: 2, publishedVersion: 2, path: '/posts/first', data: { title: 'First', tag: 't1' } })

    // the next draft: the site keeps the published title, URL and relations
    const edited = await store.save('posts', { id: draft.id, version: 2, data: { slug: 'renamed', title: 'Renamed', tag: 't2' } })
    expect(edited).toMatchObject({ version: 3, publishedVersion: 2 })
    expect(await store.get('posts', draft.id)).toMatchObject({ version: 2, path: '/posts/first', data: { title: 'First', tag: 't1' } })
    expect((await store.list('posts', { filter: { tag: { eq: 't1' } } })).items.map(e => e.id)).toEqual([draft.id])
    expect((await store.list('posts', { filter: { tag: { eq: 't2' } }, stage: 'draft' })).items.map(e => e.id)).toEqual([draft.id])
    expect(await store.resolve('/posts/first')).toMatchObject({ id: draft.id })
    expect((await store.redirects.list()).filter(r => r.source.startsWith('/posts'))).toEqual([]) // a draft's URL isn't public

    // publishing moves the URL, redirecting the old one
    await store.publish('posts', draft.id, { version: 3 })
    expect(await store.resolve('/posts/renamed')).toMatchObject({ id: draft.id })
    expect(await store.resolve('/posts/first')).toBeUndefined()
    expect((await store.redirects.list()).filter(r => r.source.startsWith('/posts')).map(r => `${r.source} → ${r.target}`)).toEqual(['/posts/first → /posts/renamed'])
    expect((await store.revisions('posts', draft.id)).map(r => [r.version, r.published])).toEqual([[4, true], [3, false], [2, true], [1, false]])
  })

  it('refuses to publish a unique value or URL another published entry still has', async () => {
    const a = await store.save('posts', { data: { slug: 'a', title: 'Shared' }, publish: true })
    await store.save('posts', { id: a.id, version: a.version, data: { slug: 'a2', title: 'Moved on' } }) // a draft: the site still has "Shared" at /posts/a
    const b = await store.save('posts', { data: { slug: 'a', title: 'Shared' } }) // free among drafts
    const refused = await store.publish('posts', b.id, { version: 1 }).catch(e => e)
    expect(refused).toBeInstanceOf(ValidationError)
    expect(refused.errors).toEqual([{ path: 'title', message: 'already used by another entry' }])
    const titled = await store.save('posts', { id: b.id, version: 1, data: { slug: 'a', title: 'Different' } })
    expect((await store.publish('posts', b.id, { version: titled.version }).catch(e => e)).errors)
      .toEqual([{ path: 'slug', message: `The URL /posts/a is already used by entry "${a.id}" in "posts"` }])
    expect(await store.get('posts', b.id)).toBeUndefined() // nothing published
  })

  it('unpublishes, keeping the draft, and deletes both', async () => {
    const post = await store.save('posts', { data: { slug: 'gone', title: 'Gone' }, publish: true })
    await store.unpublish('posts', post.id)
    expect(await store.get('posts', post.id)).toBeUndefined()
    expect(await store.resolve('/posts/gone')).toBeUndefined()
    expect(await store.get('posts', post.id, { stage: 'draft' })).toMatchObject({ publishedVersion: null, data: { title: 'Gone' } })
    expect((await store.redirects.list()).some(r => r.source === '/posts/gone')).toBe(false)

    await store.publish('posts', post.id, { version: 1 })
    await store.delete('posts', post.id)
    expect(await store.get('posts', post.id)).toBeUndefined()
    expect(await store.resolve('/posts/gone')).toBeUndefined()

    // a type that isn't versioned publishes every save: there's nothing to publish
    const tag = await store.save('tags', { data: { name: 'live' } })
    expect(await store.get('tags', tag.id)).toMatchObject({ publishedVersion: 1 })
    await expect(store.unpublish('tags', tag.id)).rejects.toBeInstanceOf(ValidationError)
  })

  it('publishes and unpublishes a versioned singleton', async () => {
    const saved = await store.saveSingleton('banner', { data: { text: 'Sale' } })
    expect(saved.publishedVersion).toBeNull()
    expect(await store.getSingleton('banner')).toBeUndefined()
    await store.publishSingleton('banner', { version: 1 })
    expect(await store.getSingleton('banner')).toMatchObject({ version: 2, publishedVersion: 2, data: { text: 'Sale' } })
    await store.saveSingleton('banner', { version: 2, data: { text: 'Sale ends soon' } })
    expect((await store.getSingleton('banner'))!.data.text).toBe('Sale')
    await store.unpublishSingleton('banner')
    expect(await store.getSingleton('banner')).toBeUndefined()
    expect((await store.getSingleton('banner', { stage: 'draft' }))!.data.text).toBe('Sale ends soon')
  })

  it('prunes revisions beyond the newest kept, once old enough, keeping those published in versioned types', async () => {
    const post = await store.save('posts', { data: { slug: 'pruned', title: 'v1' } }) // 1
    await store.publish('posts', post.id, { version: 1 }) // 2, published
    for (let v = 2; v <= 5; v++)
      await store.save('posts', { id: post.id, version: v, data: { slug: 'pruned', title: `v${v + 1}` } }) // 3 … 6
    const tag = await store.save('tags', { data: { name: 't1' } }) // not versioned: every save is published
    for (let v = 1; v <= 4; v++)
      await store.save('tags', { id: tag.id, version: v, data: { name: `t${v + 1}` } })
    const versions = async (name: string, id: string) => (await store.revisions(name, id)).map(r => r.version)

    // nothing is old enough yet
    expect(await store.pruneRevisions({ keep: 2, olderThan: new Date(Date.now() - 86_400_000) })).toBe(0)
    await query(driver, sql`update atelier_revisions set _created_at = ${'2020-01-01T00:00:00.000Z'} where source_id in (${post.id}, ${tag.id})`)
    await store.pruneRevisions({ keep: 2, olderThan: new Date(Date.now() - 86_400_000) })
    expect(await versions('posts', post.id)).toEqual([6, 5, 2]) // the newest two, and the published one
    expect(await versions('tags', tag.id)).toEqual([5, 4])
    expect(await store.get('posts', post.id)).toMatchObject({ version: 2, data: { title: 'v1' } }) // the site is untouched
  })

  it('reads a singleton field renamed with renamedFrom from its old key', async () => {
    const renamed = { ...schema, singletons: { settings: { fields: { title: f.text({ renamedFrom: 'siteName' }), editor: schema.singletons.settings.fields.editor } } } }
    const saved = (await store.getSingleton('settings'))!
    const after = createEntryStore(driver, renamed)
    expect((await after.getSingleton('settings'))!.data).toMatchObject({ title: saved.data.siteName })
    expect((await after.getSingleton('settings'))!.data).not.toHaveProperty('siteName')
  })
})
