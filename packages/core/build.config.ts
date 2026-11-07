// Merged into @nuxt/module-builder's unbuild config: also build the `atelier` CLI (package.json bin)
// and the content adapter contract (`nuxt-atelier/adapter`)
export default {
  entries: ['src/cli/index', 'src/adapter'],
}
