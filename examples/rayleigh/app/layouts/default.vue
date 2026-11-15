<script setup lang="ts">
// a page may ask for a border above the footer
const { data } = useAtelierRouteEntry()
const border = computed(() => !!(data.value?.entry.data as { footerBorder?: boolean } | undefined)?.footerBorder)
</script>

<template>
  <div>
    <SiteHeader class="mt-12" />
    <main
      class="my-23 space-y-23"
      :class="{ 'border-b border-border pb-23 dark:border-white/10': border }"
    >
      <slot />
    </main>
    <SiteFooter class="mb-23" />
  </div>
</template>
