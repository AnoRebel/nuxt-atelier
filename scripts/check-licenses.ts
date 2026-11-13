// License gate for every package in bun.lock (direct and transitive, prod and dev): fails when a license
// isn't on the allowlist and has no reviewed exception below. Run after every `bun install` or `bun add`:
// `bun run licenses`. A dependency that trips it: pick another package, or add an EXCEPTIONS entry saying
// why the license is acceptable for how we use it.
import { Glob } from 'bun'

/** Permissive licenses compatible with distributing Nuxt Atelier under MIT. */
const ALLOWED = new Set([
  'MIT',
  'MIT-0',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  '0BSD',
  'Apache-2.0',
  'BlueOak-1.0.0',
  'CC0-1.0',
  'CC-BY-4.0',
  'Unlicense',
  'Python-2.0',
  'Zlib',
  'WTFPL',
])

/**
 * Reviewed licenses outside the allowlist, keyed by package name. `license` is what the check saw when it
 * was reviewed: if it changes, the package fails again for another review.
 */
const EXCEPTIONS: Record<string, { license: string, reason: string }> = {
  '@img/sharp': {
    license: 'Apache-2.0 AND LGPL-3.0-or-later',
    reason: 'sharp\'s prebuilt binaries bundle libvips (LGPL), dynamically linked and unmodified. sharp is an optional peer the app installs itself.',
  },
  '@img/sharp-wasm32': { license: 'Apache-2.0 AND LGPL-3.0-or-later AND MIT', reason: 'As @img/sharp.' },
  '@img/sharp-libvips': { license: 'LGPL-3.0-or-later', reason: 'As @img/sharp: libvips itself, unmodified.' },
  'lightningcss': { license: 'MPL-2.0', reason: 'Build-time CSS tool (Tailwind, Vite), used unmodified, not shipped.' },
  'axe-core': { license: 'MPL-2.0', reason: 'Accessibility checks in the test suite only, used unmodified, not shipped.' },
  'rollup-plugin-dts': { license: 'LGPL-3.0-only', reason: 'Build-time (unbuild, via @nuxt/module-builder), unmodified, not shipped.' },
  'argparse': { license: 'PSF-2.0', reason: 'Python Software Foundation License, permissive. Docs build only (js-yaml).' },
  'spdx-exceptions': { license: 'CC-BY-3.0', reason: 'A data file of SPDX exception ids; attribution license. Tooling only.' },
  'tosource': { license: 'UNKNOWN', reason: 'zlib License per its LICENSE file. Docs build only (@rollup/plugin-yaml).' },
  'vaul-vue': { license: 'UNKNOWN', reason: 'MIT per its upstream repository. Docs only (@nuxt/ui).' },
  '@comark/vue': { license: 'UNKNOWN', reason: 'MIT per its LICENSE file; package.json lacks the field. Docs only (docus).' },
}

/** Platform builds (`<name>-linux-x64-gnu`, `@img/sharp-darwin-arm64`, …) share their package's review. */
const exceptionFor = (name: string) =>
  EXCEPTIONS[name] ?? EXCEPTIONS[name.replace(/-(?:android|darwin|freebsd|linux|linuxmusl|win32|wasm32)(?:-.+)?$/, '')]

const root = new URL('..', import.meta.url).pathname
const lock = Bun.JSONC.parse(await Bun.file(`${root}bun.lock`).text()) as { packages: Record<string, [string, ...unknown[]]> }

/** package.json `license`, or the legacy `licenses` array, as an SPDX-like string. */
function licenseOf(pkg: Record<string, unknown>): string {
  const l = pkg.license ?? pkg.licenses
  if (typeof l === 'string')
    return l
  if (Array.isArray(l))
    return l.map(x => (typeof x === 'string' ? x : x?.type)).join(' OR ')
  if (l && typeof l === 'object' && 'type' in l)
    return String(l.type)
  return 'UNKNOWN'
}

/** An SPDX expression passes when one of its OR branches has every AND term allowed. */
export const allowed = (expr: string) => expr.replace(/[()]/g, '').split(/\s+OR\s+/i)
  .some(branch => branch.split(/\s+AND\s+/i).every(id => ALLOWED.has(id.trim())))

// Registry answers for packages not installed here (other platforms' builds), kept between runs
const CACHE = `${root}node_modules/.cache/licenses.json`
const cache: Record<string, string> = await Bun.file(CACHE).json().catch(() => ({}))

/** The installed manifest, else the registry's (packages for other platforms aren't installed here). */
async function resolveLicense(name: string, version: string): Promise<string> {
  const dir = `${name.replace('/', '+')}@${version}`
  for await (const file of new Glob(`{${dir},${dir}+*}/node_modules/${name}/package.json`).scan({ cwd: `${root}node_modules/.bun` }))
    return licenseOf(await Bun.file(`${root}node_modules/.bun/${file}`).json())
  if (cache[`${name}@${version}`])
    return cache[`${name}@${version}`]!
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`https://registry.npmjs.org/${name}/${version}`, { signal: AbortSignal.timeout(20_000) })
      if (res.ok)
        return cache[`${name}@${version}`] = licenseOf(await res.json() as Record<string, unknown>)
    }
    catch {
      // timed out or offline: try again
    }
  }
  return 'UNRESOLVED'
}

if (import.meta.main) {
  const specs = new Set(Object.values(lock.packages).map(([spec]) => spec).filter(spec => !spec.includes('@workspace:')))
  const seen = new Map<string, string>()
  await Promise.all([...specs].map(async (spec) => {
    const at = spec.lastIndexOf('@')
    seen.set(spec, await resolveLicense(spec.slice(0, at), spec.slice(at + 1)))
  }))

  await Bun.write(CACHE, JSON.stringify(cache))

  const counts = new Map<string, number>()
  const failures: string[] = []
  for (const [id, license] of seen) {
    counts.set(license, (counts.get(license) ?? 0) + 1)
    if (!allowed(license) && exceptionFor(id.slice(0, id.lastIndexOf('@')))?.license !== license)
      failures.push(`${id}: ${license}`)
  }

  console.log(`Checked ${seen.size} packages from bun.lock`)
  for (const [license, n] of [...counts].sort((a, b) => b[1] - a[1]))
    console.log(`  ${n}\t${license}`)
  if (failures.length) {
    console.error(`\n${failures.length} package(s) need review:`)
    for (const f of failures.sort())
      console.error(`  ${f}`)
    process.exit(1)
  }
  console.log('\nAll licenses allowed.')
}
