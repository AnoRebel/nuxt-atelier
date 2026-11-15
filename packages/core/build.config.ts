// Merged into @nuxt/module-builder's unbuild config: also build the `atelier` CLI (package.json bin)
// the content adapter contract (`nuxt-atelier/adapter`), the storage driver contract (`nuxt-atelier/storage`)
// and project inspection for dev tooling (`nuxt-atelier/project`)
export default {
  entries: ['src/cli/index', 'src/adapter', 'src/storage', 'src/project'],
}
