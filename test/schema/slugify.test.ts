import { describe, expect, it } from 'vitest'
import { slugify } from '../../packages/core/src/runtime/shared/fields'

describe('slugify', () => {
  it('makes a valid slug of any title', () => {
    const cases: [string, string][] = [['Spring sale', 'spring-sale'], ['Frühjahrsverkauf', 'fruhjahrsverkauf'], ['  Straße & Co. 2026! ', 'strasse-co-2026'], ['Crème brûlée', 'creme-brulee']]
    for (const [title, slug] of cases) {
      expect(slugify(title)).toBe(slug)
      expect(slugify(title)).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) // what a slug field accepts
    }
  })
})
