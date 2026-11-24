---
"nuxt-atelier": patch
---

The published types are typed again. `defineBlock` and the field helpers from `#atelier` lost their declarations to a same-named internal shim, so props built from them were untyped. `useAtelierQuery`, `useAtelierEntry`, `useAtelierSingleton`, `useAtelierRouteEntry` and `useAtelierSiteSearch` were declared as returning `any`.
