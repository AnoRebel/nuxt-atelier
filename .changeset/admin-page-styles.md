---
'@nuxt-atelier/admin': minor
---

Your own admin pages and the overrides in `app/atelier-admin/` can use their own `<style>`, scoped or not. Vue adds a component's styles to the document's `<head>`, which the admin's shadow root doesn't see, so they didn't apply. The admin now adopts them, and they still never reach your site. Custom pages can also use the admin's page frame as `<AtelierAdminPage>` (title, icon, description, breadcrumb, actions), without importing from the admin's internals.
