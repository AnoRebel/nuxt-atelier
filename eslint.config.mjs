import { createConfigForNuxt } from '@nuxt/eslint-config'

const FS_WRITES = ['writeFile', 'writeFileSync', 'appendFile', 'appendFileSync', 'mkdir', 'mkdirSync', 'rm', 'rmSync', 'rmdir', 'rmdirSync', 'unlink', 'unlinkSync', 'symlink', 'symlinkSync', 'rename', 'renameSync', 'cp', 'cpSync', 'copyFile', 'copyFileSync']
const WRITE_MESSAGE = 'Modules must not write files directly. Use addTemplate/addTypeTemplate/addServerTemplate (written inside buildDir).'

// Public-API-only rule (design D2): no Nuxt/Nitro/Vite internals, no private options, no writes outside buildDir.
export const publicApiOnly = {
  name: 'atelier/public-api-only',
  files: ['packages/*/src/**/*.{ts,mts,js,mjs,vue}', 'test/lint/**/*.ts'],
  // the CLI writes migrations into the app on purpose; runtime code writes at run time (uploads, migrations), not at build
  ignores: ['packages/*/src/cli/**', 'packages/*/src/runtime/**'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        { regex: '^#build(?:/|$)', message: 'Internal Nuxt alias. Use addTemplate/addTypeTemplate and public @nuxt/kit APIs.' },
        { regex: '^nuxt/dist/', message: 'Nuxt internals are not a public API.' },
        { regex: '^nitro(?:pack)?/runtime/internal/', message: 'Nitro internals are not a public API. Use nuxt/server or documented Nitro utils.' },
      ],
      paths: ['fs', 'node:fs', 'fs/promises', 'node:fs/promises'].map(name => ({ name, importNames: FS_WRITES, message: WRITE_MESSAGE })),
    }],
    'no-restricted-syntax': ['error',
      {
        selector: 'MemberExpression[object.type=\'MemberExpression\'][object.property.name=\'options\'][property.name=/^_/]',
        message: 'Private nuxt.options._* fields are not a public API (e.g. use getLayerDirectories() instead of _layers).',
      },
      {
        selector: 'VariableDeclarator[init.property.name=\'options\'] > ObjectPattern > Property[key.name=/^_/]',
        message: 'Private nuxt.options._* fields are not a public API.',
      },
      {
        selector: `CallExpression[callee.property.name=/^(${FS_WRITES.join('|')})$/]`,
        message: WRITE_MESSAGE,
      },
    ],
  },
}

export default createConfigForNuxt({
  features: {
    tooling: true,
    stylistic: true,
  },
}).append(
  publicApiOnly,
  {
    // runtime code: no internals, but it may write files at run time
    name: 'atelier/public-api-only-runtime',
    files: ['packages/*/src/runtime/**/*.{ts,mts,js,mjs,vue}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: publicApiOnly.rules['no-restricted-imports'][1].patterns }],
    },
  },
  {
    // Nuxt names pages and layouts after their file (index, about, default); blocks are named like Hero,
    // and shadcn-vue's copied components keep its names (Button, Card)
    files: ['**/app/{pages,layouts,blocks}/**/*.vue', 'test/fixtures/ui-shadcn/app/components/ui/**/*.vue'],
    rules: { 'vue/multi-word-component-names': 'off' },
  },
  {
    // tests drive the dialect-generic query builders and adapter data directly
    files: ['test/storage/**/*.ts', 'test/adapter/**/*.ts', 'test/api/**/*.ts', 'test/blocks/**/*.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
  {
    // the admin's components, and the app's replacements of them, are named after their part (Home, Shell);
    // the module's components get the Atelier prefix when registered (Form is <AtelierForm>)
    files: ['packages/admin/src/runtime/components/**/*.vue', '**/app/atelier-admin/**/*.vue', 'packages/core/src/runtime/app/components/*.vue'],
    rules: { 'vue/multi-word-component-names': 'off' },
  },
  {
    // the vendored crystal-neuo copy is replaced by scripts/sync-crystal-neuo.ts, never edited
    ignores: ['openspec/**', '**/dist/**', '**/.output/**', '**/.nuxt/**', '**/.data/**', '**/*.fixture.ts', 'packages/admin/src/runtime/crystal-neuo/**'],
  },
)
