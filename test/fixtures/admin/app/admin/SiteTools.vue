<script setup lang="ts">
const portal = useAtelierAdminPortal()
</script>

<template>
  <section>
    <h1>Site tools</h1>
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
  </section>
</template>
