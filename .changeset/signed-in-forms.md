---
"nuxt-atelier": patch
---

`<AtelierForm>` sends the CSRF header a signed-in browser needs: people signed in to the admin could not send the site's forms (refused with "the x-atelier-csrf header is missing or wrong").
