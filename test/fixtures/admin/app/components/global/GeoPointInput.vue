<!-- The app's own input for its geo-point field type: the admin renders it with v-model. -->
<script setup lang="ts">
const props = defineProps<{ modelValue?: { lat: number, lng: number } | null, label?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: { lat: number, lng: number }] }>()
const set = (key: 'lat' | 'lng', text: string) => emit('update:modelValue', { lat: 0, lng: 0, ...props.modelValue, [key]: Number(text) })
</script>

<template>
  <fieldset data-geo-point>
    <legend>{{ label }}</legend>
    <label>Latitude <input
      type="number"
      step="any"
      :value="modelValue?.lat"
      @input="set('lat', ($event.target as HTMLInputElement).value)"
    ></label>
    <label>Longitude <input
      type="number"
      step="any"
      :value="modelValue?.lng"
      @input="set('lng', ($event.target as HTMLInputElement).value)"
    ></label>
  </fieldset>
</template>
