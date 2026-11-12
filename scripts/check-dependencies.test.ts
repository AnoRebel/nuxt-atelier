import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PAGE, undocumented } from './check-dependencies'

describe('dependency justification', () => {
  it('passes for the docs page as committed', async () => {
    expect(await undocumented(readFileSync(PAGE, 'utf8'))).toEqual([])
  })

  it('names a dependency missing from the page', async () => {
    const page = (readFileSync(PAGE, 'utf8')).replace('`aws4fetch`', 'aws4fetch')
    expect(await undocumented(page)).toEqual(['@nuxt-atelier/storage-s3: aws4fetch'])
  })
})
