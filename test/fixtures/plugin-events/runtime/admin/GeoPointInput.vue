<!-- The admin input for the plugin's geo-point field type. -->
<script setup lang="ts">
const props = defineProps<{ modelValue?: { lat: number, lng: number } | null, label?: string, disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: { lat: number, lng: number }] }>()
const set = (key: 'lat' | 'lng', text: string) => emit('update:modelValue', { lat: 0, lng: 0, ...props.modelValue, [key]: Number(text) })
</script>

<template>
  <fieldset
    class="app-fieldset"
    data-events-geo-point
  >
    <legend class="cn-label">
      {{ label }}
    </legend>
    <label class="cn-field">
      <span class="cn-field__label">Latitude</span>
      <input
        class="cn-input"
        type="number"
        step="any"
        :value="modelValue?.lat"
        :disabled="disabled"
        @input="set('lat', ($event.target as HTMLInputElement).value)"
      >
    </label>
    <label class="cn-field">
      <span class="cn-field__label">Longitude</span>
      <input
        class="cn-input"
        type="number"
        step="any"
        :value="modelValue?.lng"
        :disabled="disabled"
        @input="set('lng', ($event.target as HTMLInputElement).value)"
      >
    </label>
  </fieldset>
</template>
