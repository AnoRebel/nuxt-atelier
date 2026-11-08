// The shared content rendered with Tailwind utilities only, no component library
import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  extends: ['../ui-shared'],
  modules: ['../../../packages/core/src/module'],
  css: ['~/assets/css/main.css'],
  compatibilityDate: '2026-10-01',
  vite: { plugins: [tailwindcss()] },
  atelier: { migrations: { autoApply: true } },
})
