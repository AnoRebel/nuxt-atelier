---
'nuxt-atelier': patch
---

Fixes for Nuxt 5 (Nitro 3), found by testing against its nightly:

- The admin's real-time connection checks its ticket and origin again. Nitro 3 didn't find the route's WebSocket hooks, so it accepted every upgrade without them: no ticket or origin check, and no messages. Nuxt 4 (Nitro 2) was not affected.
- On Vercel, the job schedule is no longer added twice: Nitro 3 adds its own cron for scheduled tasks, so Nuxt Atelier adds none there.
- A project whose path contains "nuxt-atelier" builds a server that starts: Nuxt 5 passed the module's name to Nitro 3 as a pattern matching any such path, which bundled native dependencies like libSQL's.
