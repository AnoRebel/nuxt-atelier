---
"nuxt-atelier": patch
---

With `auth.passkeys` on, the build stops early and names `@simplewebauthn/server` or `@simplewebauthn/browser` if either isn't installed, instead of failing in the bundler. The installation and authentication docs list both packages.
