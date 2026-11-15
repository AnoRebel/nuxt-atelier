// Docs completeness: every feature the admin shows has an editor guide, and every public API value has
// reference docs.
//   bun scripts/check-docs.ts   (also test/docs/completeness.test.ts, in CI)
// The admin's features are its text's namespaces (packages/admin/src/runtime/i18n/en.ts: `media.*`,
// `comments.*`…): a new one fails this until it's given the guide that covers it, and that guide must
// mention it. The public API is what reference/33.api documents; each value needs TSDoc.
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { publicApi } from './api-reference'

const root = fileURLToPath(new URL('..', import.meta.url))
const guide = (name: string) => `docs/content/2.guides/${name}.md`

/** Admin text namespace → the guide covering it, and what that guide must say about it (a regex). */
const GUIDES: Record<string, [file: string, mentions: string]> = {
  // the admin itself: finding your way, its look, signing in
  nav: [guide('2.the-admin'), 'Finding your way'],
  sidebar: [guide('2.the-admin'), 'sidebar'],
  common: [guide('2.the-admin'), 'Editing'],
  home: [guide('2.the-admin'), 'dashboard'],
  globalSearch: [guide('2.the-admin'), 'Ctrl\\+K'],
  appearance: [guide('2.the-admin'), 'Appearance'],
  material: [guide('2.the-admin'), 'material'],
  theme: [guide('2.the-admin'), 'light or dark'],
  density: [guide('2.the-admin'), 'how dense'],
  width: [guide('2.the-admin'), 'how wide'],
  platform: [guide('2.the-admin'), 'proportions of your device'],
  signIn: [guide('2.the-admin'), 'Signing in'],
  auth: [guide('2.the-admin'), 'Sign out'],
  setup: [guide('3.users-and-roles'), 'first administrator'],
  notFound: [guide('2.the-admin'), 'Finding your way'],
  forbidden: [guide('3.users-and-roles'), 'role'],
  // entries
  list: [guide('2.the-admin'), '## Lists'],
  entry: [guide('2.the-admin'), '## Editing'],
  history: [guide('5.drafts-and-publishing'), '## Earlier versions'],
  schedule: [guide('5.drafts-and-publishing'), 'schedule'],
  field: [guide('2.the-admin'), 'field'],
  action: [guide('2.the-admin'), 'Save draft'],
  status: [guide('5.drafts-and-publishing'), 'draft'],
  richText: [guide('2.the-admin'), 'Formatting'],
  ai: [guide('2.the-admin'), 'AI suggestions'],
  seo: [guide('8.search-engines'), 'search'],
  robots: [guide('8.search-engines'), 'robots|crawlers'],
  media: [guide('6.media'), 'focal'],
  shared: [guide('10.reusing-content'), 'Shared blocks'],
  templates: [guide('10.reusing-content'), 'Templates'],
  forms: [guide('11.building-forms'), 'submissions'],
  editor: [guide('12.visual-editor'), 'visual editor'],
  // people
  users: [guide('3.users-and-roles'), 'users'],
  roles: [guide('3.users-and-roles'), 'role'],
  capability: [guide('3.users-and-roles'), 'role'],
  collab: [guide('9.working-together'), 'editing'],
  comments: [guide('9.working-together'), 'comment'],
  notifications: [guide('9.working-together'), 'notification'],
}

export function docsProblems(): string[] {
  const problems: string[] = []
  const text = readFileSync(`${root}packages/admin/src/runtime/i18n/en.ts`, 'utf8')
  const namespaces = new Set([...text.matchAll(/^ {2}'([a-z]+)\./gim)].map(m => m[1]!))
  for (const namespace of namespaces) {
    const entry = GUIDES[namespace]
    if (!entry) {
      problems.push(`the admin's "${namespace}.*" text has no editor guide: add it to GUIDES in scripts/check-docs.ts, with the guide that covers it`)
      continue
    }
    const [file, mentions] = entry
    if (!existsSync(`${root}${file}`))
      problems.push(`"${namespace}.*": ${file} doesn't exist`)
    else if (!new RegExp(mentions, 'i').test(readFileSync(`${root}${file}`, 'utf8')))
      problems.push(`"${namespace}.*": ${file} doesn't mention /${mentions}/i`)
  }
  for (const namespace of Object.keys(GUIDES)) {
    if (!namespaces.has(namespace))
      problems.push(`GUIDES lists "${namespace}", which the admin's text no longer has`)
  }
  for (const item of publicApi()) {
    if (!item.doc)
      problems.push(`${item.from} exports ${item.name} without TSDoc: document it where it's declared`)
  }
  return problems
}

if (import.meta.main) {
  const problems = docsProblems()
  if (problems.length) {
    console.error(problems.map(p => `✗ ${p}`).join('\n'))
    process.exit(1)
  }
  console.log('Every admin feature has an editor guide, and every public API value has reference docs.')
}
