// The Rayleigh tutorial (docs/content/6.tutorial/) builds examples/rayleigh chapter by chapter. The example is
// the only copy of the code: each file belongs to the chapter that adds it (FILES below), and lines a later
// chapter adds sit in `#region <chapter>` … `#endregion` comments. Chapter n's state is every file of
// chapters up to n, without the regions of later ones.
//   bun scripts/tutorial.ts          writes the tutorial pages' code blocks from those states
//   bun scripts/tutorial.ts <n> <dir> writes chapter n's state to <dir>
// test/examples/tutorial.test.ts fails when a page's code isn't its chapter's, or a file has no chapter;
// test/examples/tutorial-build.test.ts builds every chapter's state.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

export const EXAMPLE = fileURLToPath(new URL('../examples/rayleigh/', import.meta.url))
const PAGES = fileURLToPath(new URL('../docs/content/6.tutorial/', import.meta.url))

/** The chapters, in order: a page each (`<n>.<chapter>.md`, n from 1). */
export const CHAPTERS = ['setup', 'portfolio', 'layout', 'about', 'blog', 'contact', 'deploy'] as const
/** `extras` (files) and `seed` (regions): the example's, not the tutorial's; in no chapter's state. */
type Chapter = typeof CHAPTERS[number] | 'extras' | 'seed'

/** Every file of the example and the chapter adding it. `extras`: the example's, not the tutorial's. */
const FILES: Record<string, Chapter> = {
  'package.json': 'setup',
  'nuxt.config.ts': 'setup',
  'app/app.vue': 'setup',
  'app/assets/css/main.css': 'setup',
  'app/layouts/default.vue': 'setup',
  'app/components/SiteContainer.vue': 'setup',
  'app/blocks/PageIntro.vue': 'setup',
  'server/atelier/singletons/home.ts': 'setup',
  'public/favicon.svg': 'setup',
  'app/blocks/Portfolio.vue': 'portfolio',
  'app/components/icon/Search.vue': 'portfolio',
  'app/components/icon/X.vue': 'portfolio',
  'app/components/icon/ChevronLeft.vue': 'portfolio',
  'app/components/icon/ChevronRight.vue': 'portfolio',
  'server/atelier/singletons/settings.ts': 'layout',
  'app/components/SiteHeader.vue': 'layout',
  'app/components/SiteMenu.vue': 'layout',
  'app/components/SiteFooter.vue': 'layout',
  'app/components/SiteLogo.vue': 'layout',
  'app/components/DarkModeSwitch.vue': 'layout',
  'app/composables/useColorScheme.ts': 'layout',
  'app/composables/useMobileMenu.ts': 'layout',
  'app/components/icon/Sun.vue': 'layout',
  'app/components/icon/Moon.vue': 'layout',
  'app/components/icon/BrandGithub.vue': 'layout',
  'app/components/icon/BrandX.vue': 'layout',
  'app/components/icon/BrandDiscord.vue': 'layout',
  'server/atelier/collections/pages.ts': 'about',
  'app/blocks/Prose.vue': 'about',
  'app/blocks/Image.vue': 'about',
  'server/atelier/collections/posts.ts': 'blog',
  'app/blocks/Posts.vue': 'blog',
  'app/layouts/post.vue': 'blog',
  'app/components/WrittenOn.vue': 'blog',
  'app/components/BackButton.vue': 'blog',
  'app/components/SiteButton.vue': 'blog',
  'Dockerfile': 'deploy',
  '.dockerignore': 'deploy',
  'wrangler.json': 'deploy',
  'README.md': 'extras',
  'LICENSE': 'extras',
  'server/middleware/seed.ts': 'extras',
}
/** Directories that are the example's alone, every file in them: the demo content, its migrations. */
const EXTRA_DIRS = ['seed/', 'server/atelier/migrations/']
const IGNORED = /^(?:node_modules|\.nuxt|\.output|\.data|\.steps)(?:\/|$)/

const order = (chapter: Chapter) => chapter === 'extras' || chapter === 'seed' ? CHAPTERS.length : CHAPTERS.indexOf(chapter)
const REGION = /^\s*(?:\/\/|\/\*|<!--)\s*#region\s+([\w-]+)\s*(?:(?:\*\/|-->)\s*)?$/
const END = /^\s*(?:\/\/|\/\*|<!--)\s*#endregion\s*(?:(?:\*\/|-->)\s*)?$/

/** A file's text at chapter `upTo` (an index into CHAPTERS): later chapters' regions out, all markers out. */
export function atChapter(text: string, upTo: number, file = ''): string {
  const out: string[] = []
  const open: boolean[] = [] // whether each open region is kept
  for (const line of text.split('\n')) {
    const region = REGION.exec(line)
    if (region) {
      const chapter = region[1] as Chapter
      if (order(chapter) < 0)
        throw new Error(`${file}: #region ${chapter} isn't a chapter (${CHAPTERS.join(', ')}, or seed)`)
      open.push(open.every(Boolean) && order(chapter) <= upTo)
      continue
    }
    if (END.test(line)) {
      if (!open.length)
        throw new Error(`${file}: #endregion without #region`)
      open.pop()
      continue
    }
    if (open.every(Boolean))
      out.push(line)
  }
  if (open.length)
    throw new Error(`${file}: #region without #endregion`)
  // a script left empty: gone, with the blank line after it
  return out.join('\n').replace(/<script setup lang="ts">\n<\/script>\n\n?/, '')
}

/** Every file of the example, relative. */
function exampleFiles(dir = EXAMPLE): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    const rel = relative(EXAMPLE, path)
    if (IGNORED.test(rel))
      return []
    return statSync(path).isDirectory() ? exampleFiles(path) : [rel]
  })
}

/** Problems with the manifest: files with no chapter, and chapters' files that don't exist. */
export function manifestProblems(): string[] {
  const files = exampleFiles()
  return [
    ...files.filter(f => !FILES[f] && !EXTRA_DIRS.some(d => f.startsWith(d))).map(f => `examples/rayleigh/${f} has no chapter: add it to FILES in scripts/tutorial.ts`),
    ...Object.keys(FILES).filter(f => !files.includes(f)).map(f => `FILES lists examples/rayleigh/${f}, which doesn't exist`),
  ]
}

const TEXT = /\.(?:ts|vue|css|json|md|mjs|js|svg)$|^(?:Dockerfile|LICENSE|\.dockerignore)$/
/** Chapter `index`'s state of the app (0-based; CHAPTERS.length: the whole example) in `dir`. */
export function assemble(index: number, dir: string): void {
  rmSync(dir, { recursive: true, force: true })
  for (const file of exampleFiles()) {
    const chapter = FILES[file] ?? 'extras'
    if (order(chapter) > index)
      continue
    const target = join(dir, file)
    mkdirSync(dirname(target), { recursive: true })
    if (TEXT.test(file.split('/').pop()!))
      writeFileSync(target, atChapter(readFileSync(join(EXAMPLE, file), 'utf8'), index, file))
    else
      copyFileSync(join(EXAMPLE, file), target)
  }
}

/** The tutorial pages, with every `<!-- file: path -->` code block holding that file at the page's chapter. */
export function tutorialPages(): { path: string, current: string, expected: string }[] {
  return readdirSync(PAGES).filter(f => /^\d+\.[\w-]+\.md$/.test(f)).map((name) => {
    const [n, chapter] = name.split('.') as [string, string]
    const index = Number(n) - 1
    if (CHAPTERS[index] !== chapter)
      throw new Error(`docs/content/6.tutorial/${name}: chapter ${n} is ${CHAPTERS[index]}`)
    const path = join(PAGES, name)
    const current = readFileSync(path, 'utf8')
    const expected = current.replace(/(<!-- file: (\S+) -->\n(`{3,})(\w+) \[[^\]]+\]\n)[\s\S]*?\n\3\n/g, (_, head: string, file: string, fence: string) => {
      if (!existsSync(join(EXAMPLE, file)))
        throw new Error(`${name}: ${file} isn't in the example`)
      return `${head}${atChapter(readFileSync(join(EXAMPLE, file), 'utf8'), index, file).trimEnd()}\n${fence}\n`
    })
    return { path, current, expected }
  })
}

if (import.meta.main) {
  const [n, dir] = process.argv.slice(2)
  if (n && dir) {
    assemble(Number(n) - 1, dir)
    console.log(`Chapter ${n} (${CHAPTERS[Number(n) - 1] ?? 'the whole example'}) in ${dir}`)
  }
  else {
    for (const page of tutorialPages()) {
      if (page.current !== page.expected)
        writeFileSync(page.path, page.expected)
    }
    console.log('The tutorial\'s code blocks are the example\'s code.')
  }
}
