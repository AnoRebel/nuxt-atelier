// A VPS: Nuxt's default Node server behind Caddy, run by systemd. Settings come from /srv/atelier/.env.
export default defineNuxtConfig({
  modules: ['nuxt-atelier', '@nuxt-atelier/admin'],
  compatibilityDate: '2026-10-01',
  atelier: {
    auth: { trustProxy: true }, // Caddy sets X-Forwarded-For
  },
})
