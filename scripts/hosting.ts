// The hosting guides (docs/content/4.deployment/<n>.<platform>.md) show complete example files, kept in
// examples/hosting/<dir>/: the only copy, and what the deploy smoke tests build. A guide's code block showing one
// is marked with the file's path in examples/hosting, right before the fence:
//   <!-- file: docker/compose.yml -->
//   ```yaml [compose.yml]
// Every guide has these `##` sections, in this order: SECTIONS below. Its Limitations section is a table whose
// first two columns are `| Limitation | Instead |`: each row names what doesn't work on the platform and,
// in the Instead column, what to use instead; a row with an empty Instead cell is an error.
//   bun scripts/hosting.ts   rewrites the guides' marked code blocks from the example files
// test/docs/hosting.test.ts fails when a marked block differs from its file, an example directory has no guide
// or a guide no example directory, an example file is in no guide, or a guide breaks the conventions above.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const EXAMPLES = fileURLToPath(new URL('../examples/hosting/', import.meta.url))
const PAGES = fileURLToPath(new URL('../docs/content/4.deployment/', import.meta.url))

/** Each hosting guide's page name (`<n>.<name>.md`) and its example directory. Dokploy and Coolify run Docker's. */
const PLATFORMS: Record<string, string> = {
  'vps': 'vps',
  'docker': 'docker',
  'dokploy-coolify': 'docker',
  'fly': 'fly',
  'railway': 'railway',
  'render': 'render',
  'bun': 'bun',
  'deno': 'deno',
  'vercel': 'vercel',
  'netlify': 'netlify',
  'cloudflare-workers': 'cloudflare-workers',
}
/** The deployment pages that aren't hosting guides. */
const OTHER_PAGES = ['overview', 'backup', 'security', 'operations', 'performance', 'public-demo']

/** The sections every hosting guide has, in order. */
export const SECTIONS = [
  'Build command and preset',
  'Configuration files',
  'Environment variables',
  'Database',
  'Migrations on deploy',
  'Media storage',
  'Scheduled jobs',
  'Real-time',
  'Limitations',
]

const BLOCK = /(<!-- file: (\S+) -->\n(`{3,})\w+ \[[^\]]+\]\n)[\s\S]*?\n\3\n/g

/** Every file of the examples, relative to examples/hosting. */
function exampleFiles(dir = EXAMPLES): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? exampleFiles(path) : [relative(EXAMPLES, path)]
  })
}

/** The deployment pages, by name: `3.docker.md` → `docker`. */
function pages(): { name: string, file: string }[] {
  return readdirSync(PAGES).filter(f => /^\d+\.[\w-]+\.md$/.test(f)).map(file => ({ name: file.split('.')[1]!, file }))
}

/** A guide's text with every marked code block holding its example file. */
export function synced(text: string, page = ''): string {
  return text.replace(BLOCK, (_, head: string, file: string, fence: string) => {
    const path = join(EXAMPLES, file)
    let content: string
    try {
      content = readFileSync(path, 'utf8')
    }
    catch {
      throw new Error(`${page}: ${file} isn't in examples/hosting`)
    }
    return `${head}${content.trimEnd()}\n${fence}\n`
  })
}

/** The hosting guides, with their text now and with their marked code blocks synced. */
export function hostingPages(): { path: string, current: string, expected: string }[] {
  return pages().filter(p => p.name in PLATFORMS).map(({ file }) => {
    const path = join(PAGES, file)
    const current = readFileSync(path, 'utf8')
    return { path, current, expected: synced(current, file) }
  })
}

/** What's wrong with one guide's sections and limitations. */
export function pageProblems(page: string, text: string): string[] {
  const problems: string[] = []
  const headings = [...text.matchAll(/^## (.+)$/gm)].map(m => m[1]!.trim())
  const found = SECTIONS.filter(s => headings.includes(s))
  for (const section of SECTIONS.filter(s => !found.includes(s)))
    problems.push(`${page}: no "## ${section}" section`)
  const order = headings.filter(h => SECTIONS.includes(h))
  if (found.length === SECTIONS.length && order.join('\n') !== SECTIONS.join('\n'))
    problems.push(`${page}: sections out of order; expected ${SECTIONS.join(', ')}`)
  const limitations = /^## Limitations\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(text)?.[1]
  if (limitations === undefined)
    return problems
  const rows = limitations.split('\n').filter(l => l.startsWith('|')).map(l => l.split('|').slice(1, -1).map(c => c.trim()))
  if (rows[0]?.[0] !== 'Limitation' || rows[0]?.[1] !== 'Instead' || !/^:?-+:?$/.test(rows[1]?.[0] ?? ''))
    return [...problems, `${page}: the Limitations section needs a table with the columns "| Limitation | Instead |"`]
  if (rows.length < 3)
    problems.push(`${page}: the Limitations table has no rows`)
  for (const row of rows.slice(2)) {
    if (!row[1])
      problems.push(`${page}: limitation "${row[0]}" has no alternative in its Instead column`)
  }
  return problems
}

/** Guides without examples, examples without guides, example files no guide shows, and broken conventions. */
export function hostingProblems(): string[] {
  const problems: string[] = []
  const all = pages()
  for (const { name, file } of all) {
    if (!(name in PLATFORMS) && !OTHER_PAGES.includes(name))
      problems.push(`docs/content/4.deployment/${file} is neither a hosting guide in PLATFORMS (scripts/hosting.ts) nor another deployment page`)
  }
  const dirs = readdirSync(EXAMPLES).filter(d => statSync(join(EXAMPLES, d)).isDirectory())
  for (const dir of dirs.filter(d => !Object.values(PLATFORMS).includes(d)))
    problems.push(`examples/hosting/${dir} has no guide: add it to PLATFORMS in scripts/hosting.ts`)
  for (const [name, dir] of Object.entries(PLATFORMS)) {
    if (!all.some(p => p.name === name))
      problems.push(`no guide docs/content/4.deployment/<n>.${name}.md for examples/hosting/${dir}`)
    if (!dirs.includes(dir))
      problems.push(`the ${name} guide's example directory examples/hosting/${dir} doesn't exist`)
  }
  const shown = new Set<string>()
  for (const { path, current } of hostingPages()) {
    for (const m of current.matchAll(BLOCK))
      shown.add(m[2]!)
    problems.push(...pageProblems(relative(PAGES, path), current))
  }
  for (const file of exampleFiles().filter(f => !shown.has(f)))
    problems.push(`examples/hosting/${file} is shown in no guide: add a <!-- file: ${file} --> code block`)
  return problems
}

if (import.meta.main) {
  for (const page of hostingPages()) {
    if (page.current !== page.expected)
      writeFileSync(page.path, page.expected)
  }
  const problems = hostingProblems()
  console.log(problems.length ? problems.join('\n') : 'The hosting guides show the example files.')
  process.exitCode = problems.length ? 1 : 0
}
