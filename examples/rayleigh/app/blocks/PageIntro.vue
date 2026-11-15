<script setup lang="ts">
import { defineBlock, text } from '#atelier'

defineBlock({ label: 'Page intro', icon: 'heading-1', description: 'The page\'s heading, with a line under it' })
defineProps({ title: text({ required: true }), kicker: text() })
</script>

<template>
  <SiteContainer>
    <div class="max-w-content space-y-2">
      <h1>
        <AtelierField name="title">
          {{ title }}
        </AtelierField>
      </h1>
      <p
        v-if="kicker"
        class="text-sm"
      >
        <AtelierField name="kicker">
          {{ kicker }}
        </AtelierField>
      </p>
    </div>
  </SiteContainer>
</template>
