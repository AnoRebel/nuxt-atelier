---
'@nuxt-atelier/admin': patch
---

The admin stays mounted while you move around it. Its route had no page key, so `<NuxtPage>` mounted it again on every navigation: everything was fetched again, and an app with a page transition showed a blank screen in between. The route now keeps one key and skips the app's page and layout transitions. Signing in and out now empties the admin's cached data in place, so views already on screen fetch it again.
