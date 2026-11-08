<script setup lang="ts">
import { Button } from '@/components/ui/button'

// shadcn-vue's Button takes no label or link: this maps the Cta block's fields onto it
defineProps<{ label?: string, to?: string, variant?: 'solid' | 'outline' }>()
</script>

<template>
  <Button
    as-child
    size="lg"
    :variant="variant === 'outline' ? 'outline' : 'default'"
  >
    <NuxtLink :to="to">
      {{ label }}
    </NuxtLink>
  </Button>
</template>
