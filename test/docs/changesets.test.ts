import { describe, expect, it } from 'vitest'
import { changesetProblem, changesetProblems } from '../../scripts/check-changesets'

describe('changesets', () => {
  it('asks a breaking change for a link to its migration steps', () => {
    expect(changesetProblem('---\n"nuxt-atelier": minor\n---\n\nAdds sitemaps.\n')).toBeUndefined()
    expect(changesetProblem('---\n"nuxt-atelier": major\n---\n\nDrops Node 20.\n')).toMatch(/upgrading/)
    expect(changesetProblem('---\n"nuxt-atelier": minor\n---\n\n**Breaking:** renames `seo.title`.\n')).toMatch(/upgrading/)
    expect(changesetProblem('---\n"nuxt-atelier": minor\n---\n\n**Breaking:** renames `seo.title`. See [the steps](https://nuxt-atelier.anorebel.net/getting-started/upgrading#0-2).\n')).toBeUndefined()
  })

  it('finds every pending changeset releasable', () => {
    expect(changesetProblems()).toEqual([])
  })
})
