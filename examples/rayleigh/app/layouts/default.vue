<script setup lang="ts">
// #region about
// a page may ask for a border above the footer
const { data } = useAtelierRouteEntry()
const border = computed(() => !!(data.value?.entry.data as { footerBorder?: boolean } | undefined)?.footerBorder)
// #endregion
</script>

<template>
  <div>
    <!-- #region layout -->
    <SiteHeader class="mt-12" />
    <!-- #endregion -->
    <main class="my-23 space-y-23">
      <slot />
      <!-- #region about -->
      <hr
        v-if="border"
        class="border-border dark:border-white/10"
      >
      <!-- #endregion -->
    </main>
    <!-- #region layout -->
    <SiteFooter class="mb-23" />
    <!-- #endregion -->
  </div>
</template>
