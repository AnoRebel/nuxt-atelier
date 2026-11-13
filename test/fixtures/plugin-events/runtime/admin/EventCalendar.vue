<!-- The plugin's admin page: plain Vue on the admin's composables and catalogs. -->
<script setup lang="ts">
const { t } = useAdminI18n()
const { manages } = useAtelierPermissions()
</script>

<template>
  <section
    class="app-page"
    data-events-calendar
  >
    <h1 class="app-page__title">
      Event calendar
    </h1>
    <p>{{ t('events.calendar.intro') }}</p>
    <p v-if="manages('settings')">
      You manage settings.
    </p>
  </section>
</template>
