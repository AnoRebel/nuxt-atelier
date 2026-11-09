import { describe, expect, it } from 'vitest'
import type { Redirect } from '../../packages/core/src/runtime/server/redirects'
import { findRedirect, redirectLoop, sourceProblem, targetProblem } from '../../packages/core/src/runtime/server/redirects'

let n = 0
const r = (source: string, target: string): Redirect => ({ id: String(n++), source, target, status: 301, auto: false })

describe('redirects', () => {
  it('matches exact sources before patterns, and fills :names and * into the target', () => {
    const list = [r('/blog/:slug', '/news/:slug'), r('/blog/special', '/special'), r('/docs/*', '/guide/*')]
    expect(findRedirect(list, '/blog/special')?.location).toBe('/special')
    expect(findRedirect(list, '/blog/hello')?.location).toBe('/news/hello')
    expect(findRedirect(list, '/blog/hello/more')).toBeUndefined()
    expect(findRedirect(list, '/docs/a/b')?.location).toBe('/guide/a/b')
    expect(findRedirect(list, '/docs')).toBeUndefined()
  })

  it('never answers with a protocol-relative Location, nor lets a request change an absolute target\'s host (Pruvious #127)', () => {
    const list = [r('/go/*', '/*'), r('/out/:x', 'https://example.com/:x')]
    expect(findRedirect(list, '/go//evil.example')).toBeUndefined() // would be //evil.example
    expect(findRedirect(list, '/go/fine')?.location).toBe('/fine')
    expect(findRedirect(list, '/out/page')?.location).toBe('https://example.com/page')
    expect(targetProblem('/a', '//evil.example')).toMatch(/Use a path on this site/)
    expect(targetProblem('/a', '/\\evil.example')).toMatch(/Use a path on this site/)
    expect(targetProblem('/a', 'javascript:alert(1)')).toMatch(/Use a path on this site/)
    expect(targetProblem('/a/:x', 'https://:x.example')).toBeDefined()
    expect(targetProblem('/a', '/b/:missing')).toBe(':missing isn\'t in the source')
    expect(targetProblem('/a/*', 'https://example.com/*')).toBeUndefined()
  })

  it('checks sources', () => {
    expect(sourceProblem('/old-page')).toBeUndefined()
    expect(sourceProblem('/blog/:slug/*')).toBeUndefined()
    expect(sourceProblem('//evil')).toBeDefined()
    expect(sourceProblem('/a/')).toBeDefined()
    expect(sourceProblem('/a b')).toBeDefined() // not percent-encoded
    expect(sourceProblem('/api/x')).toMatch(/served by the app/)
    expect(sourceProblem('/*/a')).toBe('* may only be the last segment')
    expect(sourceProblem('/:a/:a')).toBe('Each :name may appear once')
  })

  it('finds loops, through patterns too', () => {
    expect(redirectLoop([r('/b', '/a')], r('/a', '/b'))).toEqual(['/a', '/b', '/a'])
    expect(redirectLoop([r('/b/:x', '/c/:x'), r('/c/:x', '/a/:x')], r('/a/:x', '/b/:x'))).toEqual(['/a/x', '/b/x', '/c/x', '/a/x'])
    expect(redirectLoop([r('/b', '/c')], r('/a', '/b'))).toBeUndefined()
    expect(redirectLoop([r('/b', 'https://example.com/a')], r('/a', '/b'))).toBeUndefined()
    const loop = r('/a', '/b')
    expect(redirectLoop([loop, r('/b', '/a')], { ...loop, target: '/c' })).toBeUndefined() // an edit replaces the old version
  })
})
