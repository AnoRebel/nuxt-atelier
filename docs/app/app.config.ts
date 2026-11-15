export default defineAppConfig({
  docus: {
    locale: 'en',
  },
  seo: {
    title: 'Nuxt Atelier',
    description: 'A visual CMS module for Nuxt: content schema, visual editor and admin, added to your existing app.',
  },
  header: {
    title: 'Nuxt Atelier',
  },
  // the live demo (examples/rayleigh in demo mode): every reader who starts it gets a copy of their own
  atelierDemo: {
    url: 'https://demo.nuxt-atelier.anorebel.net',
  },
  github: {
    url: 'https://github.com/AnoRebel/nuxt-atelier',
    branch: 'main',
    rootDir: 'docs',
  },
  toc: {
    bottom: {
      title: 'For LLMs',
      links: [
        { icon: 'i-lucide-file-text', label: 'llms.txt', to: '/llms.txt', target: '_blank' },
        { icon: 'i-lucide-files', label: 'llms-full.txt', to: '/llms-full.txt', target: '_blank' },
      ],
    },
  },
})
