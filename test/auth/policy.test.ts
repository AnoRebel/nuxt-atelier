import { describe, expect, it } from 'vitest'
import { defineAuthAdapter } from '../../packages/core/src/runtime/server/auth/adapter'
import { createPolicy } from '../../packages/core/src/runtime/shared/policy'

const policy = createPolicy({
  editor: {
    capabilities: ['media'],
    content: {
      'articles': { actions: ['create', 'read', 'update', 'delete'], hidden: ['internalNotes'], readOnly: ['slug'] },
      'settings': { actions: ['read'] },
      '*': { actions: ['read'] },
    },
  },
  author: {
    content: { articles: { actions: ['create', 'read', 'update', 'delete', 'publish'], ownOnly: ['update', 'delete', 'publish'] } },
  },
})
const admin = { id: 'u0', role: 'admin' }
const editor = { id: 'u1', role: 'editor' }
const author = { id: 'u2', role: 'author' }

describe('can()', () => {
  it('gives the built-in admin role everything, and nothing to nobody', () => {
    expect(policy.can(admin, 'publish', 'anything')).toBe(true)
    expect(policy.can(admin, 'manage', 'users')).toBe(true)
    expect(policy.can(null, 'read', 'articles')).toBe(false)
    expect(policy.can({ id: 'u9', role: 'deleted-role' }, 'read', 'articles')).toBe(false)
    expect(() => createPolicy({ admin: {} })).toThrow('"admin" role is built in')
  })

  it('checks operations per collection and singleton, with "*" as the fallback', () => {
    expect(policy.can(editor, 'update', 'articles')).toBe(true)
    expect(policy.can(editor, 'publish', 'articles')).toBe(false) // editor without publish
    expect(policy.can(editor, 'read', 'settings')).toBe(true)
    expect(policy.can(editor, 'update', 'settings')).toBe(false)
    expect(policy.can(editor, 'read', 'pages')).toBe(true) // from '*'
    expect(policy.can(editor, 'create', 'pages')).toBe(false)
    expect(policy.can(author, 'read', 'pages')).toBe(false) // no '*': nothing else
  })

  it('checks admin capabilities', () => {
    expect(policy.can(editor, 'manage', 'media')).toBe(true)
    expect(policy.can(editor, 'manage', 'users')).toBe(false)
    expect(policy.can(author, 'manage', 'media')).toBe(false)
  })

  it('limits own-only actions to entries the user created', () => {
    expect(policy.can(author, 'update', 'articles', { createdBy: 'u2' })).toBe(true)
    expect(policy.can(author, 'update', 'articles', { createdBy: 'u1' })).toBe(false)
    expect(policy.can(author, 'publish', 'articles', { createdBy: null })).toBe(false)
    expect(policy.can(author, 'update', 'articles')).toBe(true) // may update some entries
    expect(policy.can(author, 'read', 'articles', { createdBy: 'u1' })).toBe(true) // read isn't own-only
    expect(policy.ownOnly(author, 'delete', 'articles')).toBe(true)
    expect(policy.ownOnly(editor, 'delete', 'articles')).toBe(false)
  })

  it('applies field-level read and write rules', () => {
    const stored = { title: 'A', slug: 'a', internalNotes: 'secret', meta: { b: 1, a: 2 } }
    expect(policy.readable(editor, 'articles', stored)).toEqual({ title: 'A', slug: 'a', meta: { b: 1, a: 2 } })
    expect(policy.readable(admin, 'articles', stored)).toEqual(stored)
    // unchanged read-only values pass, whatever their key order
    expect(policy.unwritable(editor, 'articles', { title: 'B', slug: 'a' }, stored)).toEqual([])
    expect(policy.unwritable(editor, 'articles', { slug: 'b', internalNotes: 'x' }, stored)).toEqual(['slug', 'internalNotes'])
    expect(policy.unwritable(editor, 'articles', { slug: 'new' })).toEqual(['slug'])
    expect(policy.unwritable(author, 'articles', { slug: 'new' })).toEqual([])
  })
})

describe('defineAuthAdapter()', () => {
  it('names missing operations', () => {
    expect(() => defineAuthAdapter({ name: 'partial', getUser: async () => null } as never))
      .toThrow('Auth adapter "partial" is missing: signIn, signOut, users.list, users.get, users.create, users.update, users.delete')
  })
})
