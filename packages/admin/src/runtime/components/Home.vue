<!-- The dashboard home. Widgets (activity, drafts, scheduled, failed jobs, migrations) come with task 15.7. -->
<script setup lang="ts">
import { NuxtLink } from '#components'
import { useAtelierNavigation } from '../composables/useAtelierNavigation'
import { useAtelierSession } from '../composables/useAtelierSession'
import Icon from './Icon'
import Page from './Page.vue'

const { items } = useAtelierNavigation()
const { user } = useAtelierSession()
</script>

<template>
  <Page
    title="Dashboard"
    :description="`Signed in as ${user?.name || user?.email}.`"
  >
    <ul class="app-cards">
      <li
        v-for="item in items.filter(i => i.group)"
        :key="item.to"
      >
        <NuxtLink
          :to="item.to"
          class="cn-card cn-card--glass cn-card--size-sm app-card-link"
        >
          <Icon :name="item.icon" />
          {{ item.label }}
        </NuxtLink>
      </li>
    </ul>
  </Page>
</template>
