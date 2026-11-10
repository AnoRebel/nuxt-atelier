// Merged into @nuxt/module-builder's unbuild config: also build the `atelier` CLI (package.json bin)
// the content adapter contract (`nuxt-atelier/adapter`) and the storage driver contract (`nuxt-atelier/storage`)
export default {
  entries: ['src/cli/index', 'src/adapter', 'src/storage'],
}
