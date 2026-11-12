<!-- The admin's name or logo (app config `atelierAdmin.name` / `logo`). Override with app/atelier-admin/Brand.vue. -->
<script setup lang="ts">
import { useBranding } from '../branding'

defineProps<{ compact?: boolean }>()
const branding = useBranding()
</script>

<template>
  <span class="app-brand">
    <img
      v-if="branding.logo"
      :src="branding.logo"
      :alt="branding.name"
      class="app-brand__logo"
    >
    <span
      v-else-if="!compact"
      class="app-brand__name"
    >{{ branding.name }}</span>
  </span>
</template>
