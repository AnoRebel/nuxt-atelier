// Render: Nuxt's Node server (the render-com preset, from SERVER_PRESET in render.yaml), configured from the
// service's environment. PostgreSQL needs its driver in your app: npm install pg
export default defineNuxtConfig({
  modules: ['nuxt-atelier', '@nuxt-atelier/admin'],
  compatibilityDate: '2026-10-01',
})
