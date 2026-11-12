<script setup lang="ts">
import { NuxtLink } from '#components'
import { useAtelierAdmin } from '../composables/useAtelierAdmin'
import Icon from './Icon'
import Page from './Page.vue'

defineProps<{ forbidden?: boolean }>()
const { to } = useAtelierAdmin()
</script>

<template>
  <Page :title="forbidden ? 'You can\'t open this' : 'Nothing here'">
    <div class="app-empty">
      <Icon :name="forbidden ? 'shield' : 'search'" />
      <p class="app-empty__body">
        {{ forbidden ? 'Your role doesn\'t allow it. Ask an administrator if you need it.' : 'This page doesn\'t exist, or your role can\'t see it.' }}
      </p>
      <NuxtLink
        :to="to()"
        class="cn-button cn-button--secondary cn-button--size-sm"
      >
        Go to the dashboard
      </NuxtLink>
    </div>
  </Page>
</template>
