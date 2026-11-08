<script setup lang="ts">
import { defineBlock, text, textarea } from '#atelier'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

defineBlock({ label: 'Feature' })
defineProps({ title: text({ required: true }), body: textarea() })
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>{{ title }}</CardTitle>
    </CardHeader>
    <CardContent>
      <p>{{ body }}</p>
    </CardContent>
  </Card>
</template>
