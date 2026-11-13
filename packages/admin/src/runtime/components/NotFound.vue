<script setup lang="ts">
import { NuxtLink } from '#components'
import { useAtelierAdmin } from '../composables/useAtelierAdmin'
import Icon from './Icon'
import Page from './Page.vue'
import { useAdminI18n } from '../i18n'

defineProps<{ forbidden?: boolean }>()
const { t } = useAdminI18n()
const { to } = useAtelierAdmin()
</script>

<template>
  <Page :title="forbidden ? t('forbidden.title') : t('notFound.title')">
    <div class="app-empty">
      <Icon :name="forbidden ? 'shield' : 'search'" />
      <p class="app-empty__body">
        {{ forbidden ? t('forbidden.body') : t('notFound.body') }}
      </p>
      <NuxtLink
        :to="to()"
        class="cn-button cn-button--secondary cn-button--size-sm"
      >
        {{ t('notFound.home') }}
      </NuxtLink>
    </div>
  </Page>
</template>
