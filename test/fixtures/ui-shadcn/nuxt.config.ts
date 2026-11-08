// The shared content rendered with shadcn-vue: its Button and Card sources live in components/ui
// (as `shadcn-vue add` copies them), registered by shadcn-nuxt; Tailwind through its Vite plugin
import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  extends: ['../ui-shared'],
  modules: ['../../../packages/core/src/module', 'shadcn-nuxt'],
  css: ['~/assets/css/main.css'],
  compatibilityDate: '2026-10-01',
  vite: { plugins: [tailwindcss()] },
  atelier: { migrations: { autoApply: true } },
  shadcn: { prefix: '', componentDir: './app/components/ui' },
})
