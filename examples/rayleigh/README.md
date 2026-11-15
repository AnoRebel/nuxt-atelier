# Rayleigh, on Nuxt Atelier

A minimalistic portfolio with a blog: a home page of image galleries, an about page, and posts. Content is edited in the admin and the visual editor; the site is plain Nuxt with Tailwind CSS.

Rayleigh was made by [Muris Ceman](https://github.com/pruvious/rayleigh) as the template and tutorial for [Pruvious](https://pruvious.com), under the MIT license. This is a port to Nuxt Atelier: its design, components, demo content and images are Rayleigh's, kept under their original copyright (see [LICENSE](./LICENSE)). Thank you, Muris.

## Run it

From the repository's root, after `bun install` and `bun run build`:

```bash
cd examples/rayleigh
bunx atelier migrate apply   # creates .data/rayleigh.sqlite
bun run dev
```

The first request fills the empty database with the demo content (`server/middleware/seed.ts`, from `seed/`). Open http://localhost:3000/admin to create the first administrator, then edit any page there or in the **Visual editor**.

## What's where

| | |
|---|---|
| `server/atelier/singletons/home.ts` | the home page, at `/` |
| `server/atelier/collections/pages.ts` | pages at `/<slug>`: About, Blog |
| `server/atelier/collections/posts.ts` | posts at `/blog/<slug>`, in the `post` layout |
| `server/atelier/singletons/settings.ts` | the menu, the footer, and where the blog lives |
| `app/blocks/` | the blocks pages are built from: PageIntro, Portfolio, Posts, Prose (Text), Image |
| `app/components/`, `app/layouts/` | the header, menu, footer, dark mode switch and the two layouts |
| `seed/` | the demo content and its images (resized for the web), for the seed |

## The tutorial

[The tutorial](https://nuxt-atelier.anorebel.net/tutorial/setup) builds this app chapter by chapter. Each file belongs to the chapter that adds it (`scripts/tutorial.ts`), and comments like `// #region blog` … `// #endregion` mark lines a later chapter adds. The repository's tests build every chapter's state and check the tutorial shows exactly this code.

## What changed from the original

- **Content and schema:** Pruvious's collections became Nuxt Atelier's (`defineCollection`, `defineSingleton`), its fields became ours, and its HTML text became rich text. The home page is a singleton at `/`.
- **Dependencies:** Tailwind CSS 4 replaces Tailwind 3 (the theme moved to `app/assets/css/main.css`); the full-screen gallery uses a native `<dialog>` instead of Swiper; dark mode is a cookie and CSS instead of `@nuxtjs/color-mode`; there's no VueUse.
- **Dark mode** follows the system until a visitor chooses, and the server renders their choice, so nothing flashes.
