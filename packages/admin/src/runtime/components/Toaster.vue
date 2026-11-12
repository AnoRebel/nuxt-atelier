<script setup lang="ts">
import CnToast from '../crystal-neuo/components/Toast.vue'
import { toasts, useAdminToast } from '../toast'

const VARIANT = { success: 'success', error: 'danger', warning: 'warning', info: 'neutral' } as const
const { remove } = useAdminToast()
</script>

<template>
  <div class="app-toaster">
    <CnToast
      v-for="t in toasts"
      :key="t.id"
      :variant="VARIANT[t.color ?? 'info']"
      :duration="t.duration ?? (t.color === 'error' ? 10000 : 6000)"
      @dismiss="remove(t.id)"
    >
      <strong class="app-toaster__title">{{ t.title }}</strong>
      <span
        v-if="t.description"
        class="app-toaster__body"
      >{{ t.description }}</span>
    </CnToast>
  </div>
</template>
