<!--
  Design tokens for the Nuxt Atelier admin and editor UI, scoped to this wrapper so
  nothing leaks into the host site. Override the whole theme by adding
  app/components/AtelierTheme.vue to your app.
-->
<template>
  <div class="at-theme">
    <slot />
  </div>
</template>

<style>
.at-theme {
  --at-font-sans: ui-sans-serif, system-ui, sans-serif;
  --at-radius: 0.5rem;
  --at-color-primary: oklch(0.55 0.15 265);
  --at-color-bg: oklch(0.99 0 0);
  --at-color-fg: oklch(0.2 0 0);
  --at-color-muted: oklch(0.55 0 0);
  --at-color-border: oklch(0.9 0 0);
}

@media (prefers-color-scheme: dark) {
  .at-theme {
    --at-color-primary: oklch(0.7 0.14 265);
    --at-color-bg: oklch(0.18 0 0);
    --at-color-fg: oklch(0.95 0 0);
    --at-color-muted: oklch(0.7 0 0);
    --at-color-border: oklch(0.3 0 0);
  }
}
</style>
