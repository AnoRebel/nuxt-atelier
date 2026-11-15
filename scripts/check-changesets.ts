// A changeset for a breaking change links to its migration steps on the upgrading page, so the changelog
// entry it becomes does too (documentation-site spec: "Breaking change release"). Breaking: a `major` bump,
// or a summary that says so ("Breaking", "BREAKING CHANGE").
//   bun scripts/check-changesets.ts   (also test/docs/changesets.test.ts, in CI)
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const dir = fileURLToPath(new URL('../.changeset/', import.meta.url))
const UPGRADING = /\/getting-started\/upgrading#[\w-]+/

/** Why this changeset's text isn't releasable, or undefined when it is. */
export function changesetProblem(text: string): string | undefined {
  const [, front = '', summary = ''] = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text) ?? []
  const breaking = /:\s*["']?major["']?\s*$/m.test(front) || /\bbreaking\b/i.test(summary)
  if (breaking && !UPGRADING.test(summary))
    return 'a breaking change: link its migration steps, /getting-started/upgrading#<section> (docs/content/1.getting-started/7.upgrading.md)'
}

export function changesetProblems(): string[] {
  return readdirSync(dir).filter(f => f.endsWith('.md') && f !== 'README.md').flatMap((file) => {
    const problem = changesetProblem(readFileSync(`${dir}${file}`, 'utf8'))
    return problem ? [`.changeset/${file}: ${problem}`] : []
  })
}

if (import.meta.main) {
  const problems = changesetProblems()
  if (problems.length) {
    console.error(problems.map(p => `✗ ${p}`).join('\n'))
    process.exit(1)
  }
  console.log('Changesets: every breaking change links its migration steps.')
}
