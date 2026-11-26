<script setup lang="ts">
const portal = useAtelierAdminPortal()
</script>

<template>
  <AtelierAdminPage
    title="Site tools"
    icon="wrench"
  >
    <p data-site-tools>
      Only for those who manage settings.
    </p>
    <!-- an overlay of the page's own, rendered inside the admin -->
    <Teleport
      v-if="portal"
      :to="portal"
    >
      <div
        data-portal-content
        role="note"
      >
        In the admin's portal
      </div>
    </Teleport>
  </AtelierAdminPage>
</template>

<!-- the page's own style, scoped: applied in the admin's shadow root, never in the site's <head> -->
<style scoped>
[data-site-tools] {
  letter-spacing: 3px;
}
</style>
