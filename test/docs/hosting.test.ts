// The hosting guides show the example files of examples/hosting, the ones the deploy smoke tests build
// (scripts/hosting.ts): every marked code block is its file, every example has a guide and is shown in it,
// and every guide has the required sections and names an alternative for each limitation.
import { describe, expect, it } from 'vitest'
import { hostingPages, hostingProblems, pageProblems, SECTIONS, synced } from '../../scripts/hosting'

const page = (limitations: string) => `${SECTIONS.slice(0, -1).map(s => `## ${s}\n\ntext\n`).join('\n')}\n## Limitations\n\n${limitations}\n`

describe('the hosting guides', () => {
  it('show each example file as it is (run `bun scripts/hosting.ts` to update)', () => {
    for (const guide of hostingPages())
      expect(guide.current, guide.path).toBe(guide.expected)
  })

  it('cover every example directory and file, with every section and an alternative to each limitation', () => {
    expect(hostingProblems()).toEqual([])
  })

  it('catch a missing section, a section out of order, and a limitation without an alternative', () => {
    expect(pageProblems('ok.md', page('| Limitation | Instead |\n|---|---|\n| no disk | S3 |'))).toEqual([])
    expect(pageProblems('a.md', page('| Limitation | Instead |\n|---|---|\n| no disk |  |')))
      .toEqual(['a.md: limitation "no disk" has no alternative in its Instead column'])
    expect(pageProblems('b.md', page('No disk.'))).toEqual(['b.md: the Limitations section needs a table with the columns "| Limitation | Instead |"'])
    expect(pageProblems('c.md', page('| Limitation | Instead |\n|---|---|'))).toEqual(['c.md: the Limitations table has no rows'])
    expect(pageProblems('d.md', page('| Limitation | Instead |\n|---|---|\n| x | y |').replace('## Database\n', ''))).toEqual(['d.md: no "## Database" section'])
    const swapped = page('| Limitation | Instead |\n|---|---|\n| x | y |').replace('## Database', '## TMP').replace('## Media storage', '## Database').replace('## TMP', '## Media storage')
    expect(pageProblems('e.md', swapped)).toEqual([`e.md: sections out of order; expected ${SECTIONS.join(', ')}`])
  })

  it('refuses a marked block for a file that isn\'t an example', () => {
    expect(() => synced('<!-- file: nowhere/x.ts -->\n```ts [x.ts]\nx\n```\n', 'f.md')).toThrow('isn\'t in examples/hosting')
  })
})
