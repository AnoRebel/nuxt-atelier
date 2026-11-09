// Built with the Vercel and Cloudflare presets: the job schedule becomes each platform's cron
export default defineNuxtConfig({
  modules: ['../../../packages/core/src/module'],
  compatibilityDate: '2026-10-01',
  nitro: { cloudflare: { deployConfig: true } },
  atelier: { jobs: { schedule: '*/5 * * * *' }, database: { url: process.env.NITRO_PRESET?.startsWith('cloudflare') ? 'd1:DB' : 'file:.data/atelier.sqlite' } },
})
