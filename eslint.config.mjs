import { createConfigForNuxt } from '@nuxt/eslint-config'

const FS_WRITES = ['writeFile', 'writeFileSync', 'appendFile', 'appendFileSync', 'mkdir', 'mkdirSync', 'rm', 'rmSync', 'rmdir', 'rmdirSync', 'unlink', 'unlinkSync', 'symlink', 'symlinkSync', 'rename', 'renameSync', 'cp', 'cpSync', 'copyFile', 'copyFileSync']
const WRITE_MESSAGE = 'Modules must not write files directly. Use addTemplate/addTypeTemplate/addServerTemplate (written inside buildDir).'

// Public-API-only rule (design D2): no Nuxt/Nitro/Vite internals, no private options, no writes outside buildDir.
export const publicApiOnly = {
  name: 'atelier/public-api-only',
  files: ['packages/*/src/**/*.{ts,mts,js,mjs,vue}', 'test/lint/**/*.ts'],
  ignores: ['packages/*/src/cli/**'],
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
    ignores: ['openspec/**', '**/dist/**', '**/.output/**', '**/.nuxt/**', '**/.data/**', '**/*.fixture.ts'],
  },
)
