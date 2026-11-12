<!-- The app's own date input: replaces the admin's for every date field. -->
<script setup lang="ts">
defineProps<{ modelValue?: string | null, label?: string }>()
defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <label data-app-date>{{ label }} (app's input)
    <input
      type="date"
      :value="modelValue ?? ''"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    >
  </label>
</template>
